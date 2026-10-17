<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Purchase;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly SequenceService $sequences,
    ) {
    }

    /**
     * Receives goods from a supplier: stock goes up, average cost is refreshed and
     * any amount paid up front leaves the chosen account.
     */
    public function create(Store $store, User $user, array $data): Purchase
    {
        return DB::transaction(function () use ($store, $user, $data) {
            $date = Carbon::parse($data['purchased_at'])->setTimeFrom(now());
            $products = Product::query()->findMany(array_column($data['items'], 'product_id'))->keyBy('id');

            $subtotal = 0.0;
            foreach ($data['items'] as $item) {
                $subtotal += round($item['quantity'] * $item['unit_cost'], 2);
            }

            $total = round(
                $subtotal - ($data['discount_amount'] ?? 0) + ($data['tax_amount'] ?? 0) + ($data['shipping_cost'] ?? 0),
                2
            );

            if ($total < 0) {
                throw ValidationException::withMessages(['discount_amount' => 'The discount is larger than the purchase value.']);
            }

            $paid = round((float) ($data['paid_amount'] ?? 0), 2);

            if ($paid > $total) {
                throw ValidationException::withMessages(['paid_amount' => 'The amount paid is more than the purchase total.']);
            }

            $purchase = Purchase::query()->create([
                'store_id' => $store->id,
                'supplier_id' => $data['supplier_id'],
                'user_id' => $user->id,
                'reference_no' => $this->sequences->next('purchase', $store, $date),
                'supplier_invoice_no' => $data['supplier_invoice_no'] ?? null,
                'purchased_at' => $date,
                'subtotal' => round($subtotal, 2),
                'discount_amount' => $data['discount_amount'] ?? 0,
                'tax_amount' => $data['tax_amount'] ?? 0,
                'shipping_cost' => $data['shipping_cost'] ?? 0,
                'total' => $total,
                'paid_amount' => 0,
                'due_amount' => $total,
                'payment_status' => 'due',
                'note' => $data['note'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                $product = $products->get($item['product_id']);

                $purchase->items()->create([
                    'product_id' => $product->id,
                    'quantity' => $item['quantity'],
                    'unit_cost' => $item['unit_cost'],
                    'line_total' => round($item['quantity'] * $item['unit_cost'], 2),
                ]);

                $this->inventory->absorbCost($product, (float) $item['quantity'], (float) $item['unit_cost']);
                $this->inventory->move(
                    $store->id, $product, (float) $item['quantity'], StockMovement::PURCHASE,
                    $purchase, (float) $item['unit_cost'], at: $date,
                );
            }

            if ($paid > 0) {
                $this->pay($purchase, (int) $data['account_id'], $paid, $date);
            }

            return $purchase->refresh();
        });
    }

    public function pay(Purchase $purchase, int $accountId, float $amount, ?CarbonInterface $at = null): Purchase
    {
        return DB::transaction(function () use ($purchase, $accountId, $amount, $at) {
            $purchase = Purchase::query()->lockForUpdate()->findOrFail($purchase->id);

            if ($amount > $purchase->due_amount + 0.001) {
                throw ValidationException::withMessages(['amount' => 'The amount is more than what is owed on this purchase.']);
            }

            $this->ledger->record(
                $accountId, Transaction::OUT, $amount, 'purchase',
                $purchase, $purchase->store_id, $at, $purchase->reference_no, 'Supplier payment '.$purchase->reference_no,
            );

            $paid = round($purchase->paid_amount + $amount, 2);
            $due = round($purchase->due_amount - $amount, 2);

            $purchase->update([
                'paid_amount' => $paid,
                'due_amount' => $due,
                'payment_status' => $due <= 0 ? 'paid' : ($paid > 0 ? 'partial' : 'due'),
            ]);

            return $purchase;
        });
    }
}

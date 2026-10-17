<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Discount;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaleService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly DiscountService $discounts,
        private readonly SequenceService $sequences,
    ) {
    }

    /**
     * Rings up a sale. Prices, promotions and tax are always taken from the database;
     * the client only says what was sold, how it was paid and which discount was requested.
     *
     * @param  array{
     *     customer_id?: int|null,
     *     items: array<int, array{product_id: int, quantity: float|int}>,
     *     discount?: array{type: string, value: float|int}|null,
     *     coupon_code?: string|null,
     *     payments?: array<int, array{account_id: int, amount: float|int}>,
     *     expected_total?: float|int|null,
     *     note?: string|null,
     * }  $data
     */
    public function create(Store $store, User $cashier, array $data, ?CarbonInterface $at = null): Sale
    {
        $at ??= now();

        return DB::transaction(function () use ($store, $cashier, $data, $at) {
            $lines = $this->priceLines($store, $data['items'], $at);

            $subtotal = round(array_sum(array_column($lines, 'net')), 2);
            $tax = round(array_sum(array_column($lines, 'tax')), 2);
            $order = $this->resolveOrderDiscount($store, $cashier, $data, $subtotal, $at);
            $total = round($subtotal - $order['amount'] + $tax, 2);

            if (isset($data['expected_total']) && abs($data['expected_total'] - $total) > 0.01) {
                throw ValidationException::withMessages([
                    'expected_total' => 'Prices or promotions changed while this sale was open. Review the cart and try again.',
                ]);
            }

            $payments = $this->allocatePayments($store, $data['payments'] ?? [], $total);
            $due = round($total - $payments['applied'], 2);

            if ($due > 0 && empty($data['customer_id'])) {
                throw ValidationException::withMessages([
                    'payments' => 'Select a customer to sell on credit, or collect the full amount.',
                ]);
            }

            $sale = Sale::query()->create([
                'store_id' => $store->id,
                'customer_id' => $data['customer_id'] ?? null,
                'user_id' => $cashier->id,
                'discount_id' => $order['discount']?->id,
                'invoice_no' => $this->sequences->next('sale', $store, $at),
                'sold_at' => $at,
                'subtotal' => $subtotal,
                'discount_type' => $order['type'],
                'discount_value' => $order['value'],
                'discount_amount' => $order['amount'],
                'tax_amount' => $tax,
                'total' => $total,
                'cost_total' => round(array_sum(array_column($lines, 'cost')), 2),
                'paid_amount' => $payments['applied'],
                'change_amount' => $payments['change'],
                'due_amount' => $due,
                'payment_status' => $this->paymentStatus($payments['applied'], $due),
                'note' => $data['note'] ?? null,
            ]);

            foreach ($lines as $line) {
                $product = $line['product'];

                $sale->items()->create([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'sku' => $product->sku,
                    'quantity' => $line['quantity'],
                    'unit_price' => $product->sale_price,
                    'unit_cost' => $product->cost_price,
                    'discount_amount' => $line['discount'],
                    'tax_rate' => $product->tax_rate,
                    'tax_amount' => $line['tax'],
                    'line_total' => round($line['net'] + $line['tax'], 2),
                ]);

                $this->inventory->move($store->id, $product, -$line['quantity'], StockMovement::SALE, $sale, at: $at);
            }

            foreach ($payments['lines'] as $payment) {
                $this->ledger->record(
                    $payment['account_id'], Transaction::IN, $payment['amount'], 'sale',
                    $sale, $store->id, $at, $sale->invoice_no, 'Sale '.$sale->invoice_no,
                );
            }

            if ($order['discount']) {
                $order['discount']->increment('used_count');
            }

            return $sale;
        });
    }

    /**
     * Records money received against an invoice that was sold on credit.
     */
    public function collect(Sale $sale, int $accountId, float $amount, ?CarbonInterface $at = null): Sale
    {
        return DB::transaction(function () use ($sale, $accountId, $amount, $at) {
            $sale = Sale::query()->lockForUpdate()->findOrFail($sale->id);

            if ($amount > $sale->due_amount + 0.001) {
                throw ValidationException::withMessages(['amount' => 'The amount is more than what is due on this invoice.']);
            }

            $this->ledger->record(
                $accountId, Transaction::IN, $amount, 'sale',
                $sale, $sale->store_id, $at, $sale->invoice_no, 'Due collection '.$sale->invoice_no,
            );

            $paid = round($sale->paid_amount + $amount, 2);
            $due = round($sale->due_amount - $amount, 2);

            $sale->update([
                'paid_amount' => $paid,
                'due_amount' => $due,
                'payment_status' => $this->paymentStatus($paid, $due),
            ]);

            return $sale;
        });
    }

    /**
     * Takes goods back. The value returned first clears any unpaid balance on the
     * invoice; whatever is left is refunded from the given account.
     *
     * @param  array<int, array{sale_item_id: int, quantity: float|int}>  $items
     */
    public function refund(Sale $sale, User $user, array $items, ?int $accountId, ?string $note = null, ?CarbonInterface $at = null): SaleReturn
    {
        $at ??= now();

        return DB::transaction(function () use ($sale, $user, $items, $accountId, $note, $at) {
            $sale = Sale::query()->with('items.product', 'store')->lockForUpdate()->findOrFail($sale->id);

            // Share of each line the customer really paid once the order discount is spread across it.
            $gross = $sale->subtotal + $sale->tax_amount;
            $ratio = $gross > 0 ? $sale->total / $gross : 1;

            $lines = [];

            foreach ($items as $row) {
                $item = $sale->items->firstWhere('id', $row['sale_item_id']);
                $quantity = (float) $row['quantity'];

                if (! $item || $quantity <= 0) {
                    continue;
                }

                if ($quantity > $item->quantity - $item->returned_quantity + 0.0001) {
                    throw ValidationException::withMessages([
                        'items' => "Cannot return more {$item->product_name} than was sold.",
                    ]);
                }

                $share = $quantity / $item->quantity;

                $lines[] = [
                    'item' => $item,
                    'quantity' => $quantity,
                    'amount' => round($item->line_total * $share * $ratio, 2),
                    'tax' => round($item->tax_amount * $share * $ratio, 2),
                    'cost' => round($item->unit_cost * $quantity, 2),
                ];
            }

            if (! $lines) {
                throw ValidationException::withMessages(['items' => 'Enter a quantity for at least one item.']);
            }

            $total = round(array_sum(array_column($lines, 'amount')), 2);
            $dueCleared = min($sale->due_amount, $total);
            $refund = round(min($total - $dueCleared, $sale->paid_amount), 2);

            if ($refund > 0 && ! $accountId) {
                throw ValidationException::withMessages(['account_id' => 'Choose the account the refund is paid from.']);
            }

            $return = SaleReturn::query()->create([
                'sale_id' => $sale->id,
                'store_id' => $sale->store_id,
                'user_id' => $user->id,
                'reference_no' => $this->sequences->next('sale_return', $sale->store, $at),
                'returned_at' => $at,
                'total_amount' => $total,
                'tax_amount' => round(array_sum(array_column($lines, 'tax')), 2),
                'cost_amount' => round(array_sum(array_column($lines, 'cost')), 2),
                'refund_amount' => $refund,
                'note' => $note,
            ]);

            foreach ($lines as $line) {
                $item = $line['item'];

                $return->items()->create([
                    'sale_item_id' => $item->id,
                    'product_id' => $item->product_id,
                    'quantity' => $line['quantity'],
                    'amount' => $line['amount'],
                ]);

                $item->update(['returned_quantity' => $item->returned_quantity + $line['quantity']]);

                $this->inventory->move(
                    $sale->store_id, $item->product, $line['quantity'], StockMovement::SALE_RETURN,
                    $return, $item->unit_cost, at: $at,
                );
            }

            if ($refund > 0) {
                $this->ledger->record(
                    $accountId, Transaction::OUT, $refund, 'sale_refund',
                    $return, $sale->store_id, $at, $return->reference_no, 'Refund for '.$sale->invoice_no,
                );
            }

            $paid = round($sale->paid_amount - $refund, 2);
            $due = round($sale->due_amount - $dueCleared, 2);
            $everythingBack = $sale->items->every(fn ($item) => $item->returned_quantity >= $item->quantity);

            $sale->update([
                'returned_amount' => round($sale->returned_amount + $total, 2),
                'paid_amount' => $paid,
                'due_amount' => $due,
                'payment_status' => $this->paymentStatus($paid, $due),
                'status' => $everythingBack ? 'returned' : 'partially_returned',
            ]);

            return $return;
        });
    }

    /**
     * @return array<int, array{product: Product, quantity: float, discount: float, net: float, tax: float, cost: float}>
     */
    private function priceLines(Store $store, array $items, CarbonInterface $at): array
    {
        // The same product scanned twice is one line.
        $quantities = [];
        foreach ($items as $item) {
            $quantities[$item['product_id']] = ($quantities[$item['product_id']] ?? 0) + (float) $item['quantity'];
        }

        $products = Product::query()->active()->with('unit')->findMany(array_keys($quantities))->keyBy('id');
        $promotions = $this->discounts->linePromotions($store->id, $at);
        $lines = [];

        foreach ($quantities as $productId => $quantity) {
            $product = $products->get($productId);

            if (! $product) {
                throw ValidationException::withMessages(['items' => 'One of the products is no longer available for sale.']);
            }

            if (! $product->unit->allow_decimal && floor($quantity) != $quantity) {
                throw ValidationException::withMessages(['items' => "{$product->name} can only be sold in whole units."]);
            }

            $gross = round($product->sale_price * $quantity, 2);
            $promotion = $this->discounts->bestForProduct($product, $promotions);
            $discount = $promotion ? min($gross, round($promotion['amount'] * $quantity, 2)) : 0.0;
            $net = round($gross - $discount, 2);

            $lines[] = [
                'product' => $product,
                'quantity' => $quantity,
                'discount' => $discount,
                'net' => $net,
                'tax' => round($net * $product->tax_rate / 100, 2),
                'cost' => round($product->cost_price * $quantity, 2),
            ];
        }

        return $lines;
    }

    /**
     * A manual discount wins over a coupon, which wins over automatic order promotions.
     *
     * @return array{type: ?string, value: float, amount: float, discount: ?Discount}
     */
    private function resolveOrderDiscount(Store $store, User $cashier, array $data, float $subtotal, CarbonInterface $at): array
    {
        $manual = $data['discount'] ?? null;

        if ($manual && $manual['value'] > 0) {
            if (! $cashier->hasPermission('sales.discount')) {
                throw ValidationException::withMessages(['discount' => 'You are not allowed to give manual discounts.']);
            }

            $amount = $manual['type'] === 'percent' ? $subtotal * min(100, $manual['value']) / 100 : $manual['value'];

            return [
                'type' => $manual['type'],
                'value' => (float) $manual['value'],
                'amount' => round(min($amount, $subtotal), 2),
                'discount' => null,
            ];
        }

        if (! empty($data['coupon_code'])) {
            $coupon = $this->discounts->coupon($data['coupon_code'], $store->id, $subtotal, $at);

            return ['type' => 'coupon', 'value' => $coupon->value, 'amount' => $coupon->amountFor($subtotal), 'discount' => $coupon];
        }

        $promotion = $this->discounts->bestForOrder($subtotal, $this->discounts->orderPromotions($store->id, $at));

        if ($promotion) {
            return ['type' => 'promo', 'value' => $promotion['discount']->value, 'amount' => $promotion['amount'], 'discount' => $promotion['discount']];
        }

        return ['type' => null, 'value' => 0.0, 'amount' => 0.0, 'discount' => null];
    }

    /**
     * Applies tendered amounts to the total in the order given. Anything over the total is change.
     *
     * @return array{lines: array<int, array{account_id: int, amount: float}>, applied: float, change: float}
     */
    private function allocatePayments(Store $store, array $payments, float $total): array
    {
        $allowed = Account::query()->where('is_active', true)->forStores([$store->id])->pluck('id')->all();
        $remaining = $total;
        $tendered = 0.0;
        $lines = [];

        foreach ($payments as $payment) {
            $amount = round((float) $payment['amount'], 2);

            if ($amount <= 0) {
                continue;
            }

            if (! in_array((int) $payment['account_id'], $allowed, true)) {
                throw ValidationException::withMessages(['payments' => 'One of the payment accounts cannot be used in this store.']);
            }

            $tendered += $amount;
            $applied = round(min($amount, $remaining), 2);

            if ($applied > 0) {
                $lines[] = ['account_id' => (int) $payment['account_id'], 'amount' => $applied];
                $remaining = round($remaining - $applied, 2);
            }
        }

        return [
            'lines' => $lines,
            'applied' => round($total - $remaining, 2),
            'change' => round(max(0, $tendered - $total), 2),
        ];
    }

    private function paymentStatus(float $paid, float $due): string
    {
        return match (true) {
            $due <= 0 => 'paid',
            $paid > 0 => 'partial',
            default => 'due',
        };
    }
}

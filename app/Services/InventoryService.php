<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Setting;
use App\Models\StockAdjustment;
use App\Models\StockLevel;
use App\Models\StockMovement;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

/**
 * The only place stock quantities are changed. Every method must run inside a transaction.
 */
class InventoryService
{
    public function __construct(private readonly SequenceService $sequences)
    {
    }

    /**
     * Changes on-hand stock and writes the matching ledger row.
     * A positive quantity adds stock, a negative one removes it.
     */
    public function move(
        int $storeId,
        Product $product,
        float $quantity,
        string $type,
        ?Model $reference = null,
        ?float $unitCost = null,
        ?string $note = null,
        ?CarbonInterface $at = null,
    ): StockMovement {
        $key = ['store_id' => $storeId, 'product_id' => $product->id];

        StockLevel::query()->firstOrCreate($key);
        $level = StockLevel::query()->where($key)->lockForUpdate()->first();

        $balance = round($level->quantity + $quantity, 3);

        if ($quantity < 0 && $balance < 0 && Setting::value('allow_negative_stock') !== '1') {
            throw ValidationException::withMessages([
                'items' => sprintf('Not enough stock of %s. Only %s available.', $product->name, $level->quantity + 0),
            ]);
        }

        $level->update(['quantity' => $balance]);

        return StockMovement::query()->create([
            ...$key,
            'user_id' => auth()->id(),
            'type' => $type,
            'quantity' => $quantity,
            'balance_after' => $balance,
            'unit_cost' => $unitCost ?? $product->cost_price,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'note' => $note,
            'moved_at' => $at ?? now(),
        ]);
    }

    /**
     * Folds a newly received batch into the product's weighted average cost.
     * Call before the stock itself is moved in.
     */
    public function absorbCost(Product $product, float $quantity, float $unitCost): void
    {
        $onHand = max(0, (float) StockLevel::query()->where('product_id', $product->id)->sum('quantity'));
        $combined = $onHand + $quantity;

        if ($combined <= 0) {
            return;
        }

        $product->update([
            'cost_price' => round((($onHand * $product->cost_price) + ($quantity * $unitCost)) / $combined, 2),
        ]);
    }

    /**
     * Writes stock up or down outside of normal trading (damage, counts, opening balances).
     *
     * @param  array<int, array{product_id: int, quantity: float|int}>  $items  signed quantities
     */
    public function adjust(Store $store, User $user, string $reason, array $items, ?string $note = null, ?CarbonInterface $at = null): StockAdjustment
    {
        $at ??= now();
        $products = Product::query()->findMany(array_column($items, 'product_id'))->keyBy('id');

        $adjustment = StockAdjustment::query()->create([
            'store_id' => $store->id,
            'user_id' => $user->id,
            'reference_no' => $this->sequences->next('adjustment', $store, $at),
            'reason' => $reason,
            'note' => $note,
            'adjusted_at' => $at,
        ]);

        foreach ($items as $item) {
            $product = $products->get($item['product_id']);

            $adjustment->items()->create([
                'product_id' => $product->id,
                'quantity' => $item['quantity'],
                'unit_cost' => $product->cost_price,
            ]);

            $this->move($store->id, $product, (float) $item['quantity'], StockMovement::ADJUSTMENT, $adjustment, note: ucfirst($reason), at: $at);
        }

        return $adjustment;
    }

    /**
     * Moves stock from one store to another in a single step.
     *
     * @param  array<int, array{product_id: int, quantity: float|int}>  $items
     */
    public function transfer(Store $from, int $toStoreId, User $user, array $items, ?string $note = null, ?CarbonInterface $at = null): StockTransfer
    {
        $at ??= now();
        $products = Product::query()->findMany(array_column($items, 'product_id'))->keyBy('id');

        $transfer = StockTransfer::query()->create([
            'from_store_id' => $from->id,
            'to_store_id' => $toStoreId,
            'user_id' => $user->id,
            'reference_no' => $this->sequences->next('transfer', $from, $at),
            'note' => $note,
            'transferred_at' => $at,
        ]);

        foreach ($items as $item) {
            $product = $products->get($item['product_id']);
            $quantity = (float) $item['quantity'];

            $transfer->items()->create([
                'product_id' => $product->id,
                'quantity' => $quantity,
                'unit_cost' => $product->cost_price,
            ]);

            $this->move($from->id, $product, -$quantity, StockMovement::TRANSFER_OUT, $transfer, at: $at);
            $this->move($toStoreId, $product, $quantity, StockMovement::TRANSFER_IN, $transfer, at: $at);
        }

        return $transfer;
    }
}

<?php

namespace App\Services;

use App\Models\Discount;
use App\Models\Product;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class DiscountService
{
    /**
     * Automatic promotions on specific products or categories.
     *
     * @return Collection<int, Discount>
     */
    public function linePromotions(int $storeId, ?CarbonInterface $at = null): Collection
    {
        return Discount::query()
            ->running($storeId, $at)
            ->whereNull('code')
            ->whereIn('applies_to', ['product', 'category'])
            ->with('targets')
            ->get();
    }

    /**
     * Automatic promotions on the whole order.
     *
     * @return Collection<int, Discount>
     */
    public function orderPromotions(int $storeId, ?CarbonInterface $at = null): Collection
    {
        return Discount::query()
            ->running($storeId, $at)
            ->whereNull('code')
            ->where('applies_to', 'order')
            ->get();
    }

    /**
     * The most generous promotion for one unit of a product, if any.
     *
     * @return array{discount: Discount, amount: float}|null
     */
    public function bestForProduct(Product $product, Collection $promotions): ?array
    {
        $best = null;

        foreach ($promotions as $promotion) {
            $targetId = $promotion->applies_to === 'product' ? $product->id : $product->category_id;

            if (! $targetId || ! $promotion->targets->contains('target_id', $targetId)) {
                continue;
            }

            $amount = $promotion->amountFor($product->sale_price);

            if ($amount > 0 && (! $best || $amount > $best['amount'])) {
                $best = ['discount' => $promotion, 'amount' => $amount];
            }
        }

        return $best;
    }

    /**
     * @return array{discount: Discount, amount: float}|null
     */
    public function bestForOrder(float $subtotal, Collection $promotions): ?array
    {
        $best = null;

        foreach ($promotions as $promotion) {
            if ($subtotal < $promotion->min_purchase) {
                continue;
            }

            $amount = $promotion->amountFor($subtotal);

            if ($amount > 0 && (! $best || $amount > $best['amount'])) {
                $best = ['discount' => $promotion, 'amount' => $amount];
            }
        }

        return $best;
    }

    public function coupon(string $code, int $storeId, ?float $subtotal = null, ?CarbonInterface $at = null): Discount
    {
        $coupon = Discount::query()
            ->running($storeId, $at)
            ->where('code', strtoupper(trim($code)))
            ->first();

        if (! $coupon) {
            throw ValidationException::withMessages(['coupon_code' => 'This coupon is not valid or has expired.']);
        }

        if ($subtotal !== null && $subtotal < $coupon->min_purchase) {
            throw ValidationException::withMessages([
                'coupon_code' => sprintf('This coupon needs a minimum purchase of %s.', number_format($coupon->min_purchase, 2)),
            ]);
        }

        return $coupon;
    }
}

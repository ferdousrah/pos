<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Discount extends Model
{
    protected $casts = [
        'value' => 'float',
        'min_purchase' => 'float',
        'max_discount' => 'float',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'usage_limit' => 'integer',
        'used_count' => 'integer',
        'is_active' => 'boolean',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function targets(): HasMany
    {
        return $this->hasMany(DiscountTarget::class);
    }

    /**
     * Discounts that can be used right now in the given store.
     */
    public function scopeRunning(Builder $query, int $storeId, ?CarbonInterface $at = null): Builder
    {
        $at ??= now();

        return $query
            ->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('store_id')->orWhere('store_id', $storeId))
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $at))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $at))
            ->where(fn (Builder $q) => $q->whereNull('usage_limit')->orWhereColumn('used_count', '<', 'usage_limit'));
    }

    /**
     * Money taken off the given base amount, respecting the cap.
     */
    public function amountFor(float $base): float
    {
        $amount = $this->type === 'percent' ? $base * $this->value / 100 : $this->value;

        if ($this->max_discount !== null && $this->max_discount > 0) {
            $amount = min($amount, $this->max_discount);
        }

        return round(max(0, min($amount, $base)), 2);
    }
}

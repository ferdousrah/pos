<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends Model
{
    public const TYPES = ['cash', 'bank', 'mobile', 'card'];

    protected $casts = [
        'opening_balance' => 'float',
        'balance' => 'float',
        'is_active' => 'boolean',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /**
     * Accounts usable from the given stores: their own plus the shared ones.
     */
    public function scopeForStores(Builder $query, array $storeIds): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNull('store_id')->orWhereIn('store_id', $storeIds));
    }
}

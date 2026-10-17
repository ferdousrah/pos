<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Sale extends Model
{
    protected $casts = [
        'sold_at' => 'datetime',
        'subtotal' => 'float',
        'discount_value' => 'float',
        'discount_amount' => 'float',
        'tax_amount' => 'float',
        'total' => 'float',
        'cost_total' => 'float',
        'paid_amount' => 'float',
        'change_amount' => 'float',
        'due_amount' => 'float',
        'returned_amount' => 'float',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function discount(): BelongsTo
    {
        return $this->belongsTo(Discount::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class);
    }

    public function payments(): MorphMany
    {
        return $this->morphMany(Transaction::class, 'source')->orderBy('transacted_at');
    }
}

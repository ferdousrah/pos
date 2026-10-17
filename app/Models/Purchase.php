<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Purchase extends Model
{
    protected $casts = [
        'purchased_at' => 'date:Y-m-d',
        'subtotal' => 'float',
        'discount_amount' => 'float',
        'tax_amount' => 'float',
        'shipping_cost' => 'float',
        'total' => 'float',
        'paid_amount' => 'float',
        'due_amount' => 'float',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseItem::class);
    }

    public function payments(): MorphMany
    {
        return $this->morphMany(Transaction::class, 'source')->orderBy('transacted_at');
    }
}

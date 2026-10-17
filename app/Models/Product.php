<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $appends = ['image_url'];

    protected $hidden = ['image_path'];

    protected $casts = [
        'cost_price' => 'float',
        'sale_price' => 'float',
        'tax_rate' => 'float',
        'reorder_level' => 'float',
        'is_active' => 'boolean',
        'stock' => 'float',
    ];

    /**
     * Public URL of the product photo. Built from the request, so it is right
     * whether the app is served from a domain root or a sub-folder.
     */
    protected function imageUrl(): Attribute
    {
        return Attribute::get(fn () => $this->image_path ? asset('uploads/'.$this->image_path) : null);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function stockLevels(): HasMany
    {
        return $this->hasMany(StockLevel::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('products.is_active', true);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (blank($term)) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('products.name', 'like', "%{$term}%")
                ->orWhere('products.sku', 'like', "%{$term}%")
                ->orWhere('products.barcode', $term);
        });
    }

    /**
     * Adds a `stock` column holding the on-hand quantity across the given stores.
     */
    public function scopeWithStock(Builder $query, array $storeIds): Builder
    {
        return $query->withSum(
            ['stockLevels as stock' => fn (Builder $q) => $q->whereIn('store_id', $storeIds)],
            'quantity'
        );
    }
}

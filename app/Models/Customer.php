<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use SoftDeletes;

    protected $casts = [
        'is_active' => 'boolean',
        'sales_count' => 'integer',
        'total_spent' => 'float',
        'total_due' => 'float',
    ];

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }
}

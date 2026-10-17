<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Loan extends Model
{
    /** Money the business borrowed. */
    public const TAKEN = 'taken';

    /** Money the business lent out. */
    public const GIVEN = 'given';

    protected $appends = ['outstanding'];

    protected $casts = [
        'principal' => 'float',
        'principal_repaid' => 'float',
        'interest_total' => 'float',
        'issued_at' => 'date:Y-m-d',
        'due_at' => 'date:Y-m-d',
    ];

    protected function outstanding(): Attribute
    {
        return Attribute::get(fn () => round($this->principal - $this->principal_repaid, 2));
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LoanPayment::class)->orderByDesc('paid_at')->orderByDesc('id');
    }

    public function transactions(): MorphMany
    {
        return $this->morphMany(Transaction::class, 'source');
    }
}

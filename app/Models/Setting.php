<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Setting extends Model
{
    public const DEFAULTS = [
        'business_name' => 'Kontor',
        'business_phone' => '',
        'business_address' => '',
        'currency_symbol' => '৳',
        'tax_label' => 'VAT',
        'receipt_footer' => 'Thank you for shopping with us.',
        'allow_negative_stock' => '0',
    ];

    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = 'key';
    protected $keyType = 'string';

    public static function allValues(): array
    {
        return Cache::rememberForever('settings', fn () => array_merge(
            self::DEFAULTS,
            self::query()->pluck('value', 'key')->all()
        ));
    }

    public static function value(string $key): ?string
    {
        return self::allValues()[$key] ?? null;
    }

    public static function put(array $values): void
    {
        foreach ($values as $key => $value) {
            self::query()->updateOrCreate(['key' => $key], ['value' => $value]);
        }

        Cache::forget('settings');
    }
}

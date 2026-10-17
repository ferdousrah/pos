<?php

namespace App\Services;

use App\Models\Store;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Issues gap-free document numbers such as INV-DHK-2610-0042.
 * Numbers restart every month and are scoped per store. Must be called inside a transaction.
 */
class SequenceService
{
    private const PREFIXES = [
        'sale' => 'INV',
        'sale_return' => 'RET',
        'purchase' => 'PUR',
        'adjustment' => 'ADJ',
        'transfer' => 'TRF',
        'expense' => 'EXP',
        'income' => 'INC',
        'salary' => 'PAY',
        'loan' => 'LOAN',
    ];

    public function next(string $type, Store $store, ?CarbonInterface $date = null): string
    {
        $period = ($date ?? now())->format('ym');
        $key = ['type' => $type, 'store_id' => $store->id, 'period' => $period];

        DB::table('document_sequences')->insertOrIgnore($key + ['last_number' => 0]);

        $number = DB::table('document_sequences')->where($key)->lockForUpdate()->value('last_number') + 1;

        DB::table('document_sequences')->where($key)->update(['last_number' => $number]);

        return sprintf('%s-%s-%s-%04d', self::PREFIXES[$type], $store->code, $period, $number);
    }
}

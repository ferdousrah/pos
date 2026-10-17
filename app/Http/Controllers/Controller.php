<?php

namespace App\Http\Controllers;

use App\Support\StoreContext;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

abstract class Controller
{
    protected function perPage(Request $request, int $default = 15): int
    {
        return min(100, max(5, $request->integer('per_page', $default)));
    }

    /**
     * Reads the from/to query parameters as an inclusive day range.
     *
     * @return array{0: CarbonInterface, 1: CarbonInterface}
     */
    protected function period(Request $request, int $defaultDays = 30): array
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $to = $request->date('to')?->endOfDay() ?? now()->endOfDay();
        $from = $request->date('from')?->startOfDay() ?? $to->copy()->subDays($defaultDays - 1)->startOfDay();

        return [$from, $to];
    }

    /**
     * Hides records that belong to a store the user cannot see.
     */
    protected function ensureStoreAccess(int $storeId): void
    {
        abort_unless(app(StoreContext::class)->canAccess($storeId), 404);
    }

    /**
     * Validation rule for an account money may move through in the current store context:
     * active, and either shared or owned by a store the user is working in.
     */
    protected function usableAccount(): Exists
    {
        $storeIds = app(StoreContext::class)->ids();

        return Rule::exists('accounts', 'id')
            ->where('is_active', true)
            ->where(fn (Builder $query) => $query->whereNull('store_id')->orWhereIn('store_id', $storeIds));
    }
}

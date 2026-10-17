<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FinanceEntry;
use App\Models\Loan;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Services\ReportService;
use App\Support\StoreContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request, StoreContext $context, ReportService $reports): JsonResponse
    {
        $days = in_array($request->integer('days'), [7, 30, 90], true) ? $request->integer('days') : 30;
        $storeIds = $context->ids();

        $to = now()->endOfDay();
        $from = today()->subDays($days - 1);
        $previousTo = $from->copy()->subSecond();
        $previousFrom = $from->copy()->subDays($days);

        $current = $reports->totals($storeIds, $from, $to);
        $previous = $reports->totals($storeIds, $previousFrom, $previousTo);

        $expenses = fn ($a, $b) => (float) FinanceEntry::query()
            ->where('type', FinanceEntry::EXPENSE)
            ->whereIn('store_id', $storeIds)
            ->whereBetween('entry_date', [$a->toDateString(), $b->toDateString()])
            ->sum('amount') + $reports->salaries($storeIds, $a, $b) + $reports->loanInterest(Loan::TAKEN, $storeIds, $a, $b);

        $ids = implode(',', array_map('intval', $storeIds)) ?: '0';
        $onHand = "(select coalesce(sum(sl.quantity), 0) from stock_levels sl where sl.product_id = products.id and sl.store_id in ({$ids}))";

        return response()->json([
            'days' => $days,
            'today' => $reports->totals($storeIds, today(), $to),
            'yesterday' => $reports->totals($storeIds, today()->subDay(), today()->subSecond()),
            'current' => $current + ['expenses' => $expenses($from, $to)],
            'previous' => $previous + ['expenses' => $expenses($previousFrom, $previousTo)],
            'trend' => $reports->daily($storeIds, $from, $to),
            'top_products' => $reports->topProducts($storeIds, $from, $to, 6),
            'payment_mix' => $reports->paymentMix($storeIds, $from, $to),
            'by_store' => count($storeIds) > 1 ? $reports->salesBy('store', $storeIds, $from, $to) : [],
            'receivable' => (float) Sale::query()->whereIn('store_id', $storeIds)->sum('due_amount'),
            'payable' => (float) Purchase::query()->whereIn('store_id', $storeIds)->sum('due_amount'),
            'low_stock_count' => Product::query()->active()->whereRaw("{$onHand} <= products.reorder_level")->count(),
            'low_stock' => Product::query()
                ->active()
                ->with('unit:id,short_name')
                ->withStock($storeIds)
                ->whereRaw("{$onHand} <= products.reorder_level")
                ->orderByRaw("{$onHand} / greatest(products.reorder_level, 1)")
                ->limit(6)
                ->get(['id', 'unit_id', 'name', 'sku', 'reorder_level']),
            'recent_sales' => Sale::query()
                ->with('customer:id,name', 'store:id,code')
                ->whereIn('store_id', $storeIds)
                ->latest('sold_at')
                ->limit(7)
                ->get(['id', 'store_id', 'customer_id', 'invoice_no', 'sold_at', 'total', 'payment_status', 'status']),
        ]);
    }
}

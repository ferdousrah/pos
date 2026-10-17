<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportLibrary;
use App\Services\ReportService;
use App\Support\StoreContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly ReportService $reports,
    ) {
    }

    public function sales(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $storeIds = $this->context->ids();

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $this->reports->totals($storeIds, $from, $to),
            'daily' => $this->reports->daily($storeIds, $from, $to),
            'by_category' => $this->reports->salesBy('category', $storeIds, $from, $to),
            'by_store' => $this->reports->salesBy('store', $storeIds, $from, $to),
            'by_cashier' => $this->reports->salesBy('cashier', $storeIds, $from, $to),
            'by_payment' => $this->reports->paymentMix($storeIds, $from, $to),
            'top_products' => $this->reports->topProducts($storeIds, $from, $to, 15),
        ]);
    }

    /**
     * One tabular report from the library, as plain rows. Sorting, totals and
     * export happen in the browser, on exactly the rows returned here.
     */
    public function library(Request $request, string $key, ReportLibrary $library): JsonResponse
    {
        abort_unless(in_array($key, ReportLibrary::KEYS, true), 404);

        [$from, $to] = $this->period($request);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'generated_at' => now()->toIso8601String(),
        ] + $library->run($key, $this->context->ids(), $from, $to, $request));
    }

    public function profitAndLoss(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ] + $this->reports->profitAndLoss($this->context->ids(), $from, $to));
    }

    /**
     * What the stock on the shelves is worth, by category.
     */
    public function stock(): JsonResponse
    {
        $rows = DB::table('stock_levels')
            ->join('products', 'products.id', '=', 'stock_levels.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->whereIn('stock_levels.store_id', $this->context->ids())
            ->whereNull('products.deleted_at')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('cost_value')
            ->get([
                DB::raw("coalesce(categories.name, 'Uncategorised') as name"),
                DB::raw('count(distinct products.id) as products'),
                DB::raw('sum(stock_levels.quantity) as units'),
                DB::raw('sum(stock_levels.quantity * products.cost_price) as cost_value'),
                DB::raw('sum(stock_levels.quantity * products.sale_price) as retail_value'),
            ])
            ->map(fn ($row) => [
                'name' => $row->name,
                'products' => (int) $row->products,
                'units' => (float) $row->units,
                'cost_value' => (float) $row->cost_value,
                'retail_value' => (float) $row->retail_value,
            ]);

        return response()->json([
            'by_category' => $rows,
            'totals' => [
                'products' => $rows->sum('products'),
                'units' => $rows->sum('units'),
                'cost_value' => round($rows->sum('cost_value'), 2),
                'retail_value' => round($rows->sum('retail_value'), 2),
            ],
        ]);
    }
}

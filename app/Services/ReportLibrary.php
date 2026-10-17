<?php

namespace App\Services;

use App\Models\Account;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The tabular reports behind Reports → All reports.
 *
 * Every report returns plain rows; the browser handles sorting, totals and export.
 * Figures follow the same rules as ReportService so they agree with the dashboard
 * and the profit and loss statement:
 *
 *   gross sales = quantity × list price, excluding tax
 *   net sales   = gross sales − discounts − returns, excluding tax
 *   COGS        = cost recorded on each sale line at the time of sale, less returns
 */
class ReportLibrary
{
    public const KEYS = [
        'daily-sales', 'store-sales', 'product-sales', 'group-sales', 'cashier-sales', 'hourly-sales',
        'payment-methods', 'sales-returns', 'discounts', 'top-customers',
        'low-stock', 'dead-stock', 'stock-ledger',
        'supplier-purchases', 'product-purchases',
        'account-book', 'receivable-aging', 'payable-aging', 'tax', 'expenses',
    ];

    /** @var int[] */
    private array $ids = [];

    private CarbonInterface $from;

    private CarbonInterface $to;

    /**
     * @param  int[]  $storeIds
     * @return array{rows: iterable, meta?: array}
     */
    public function run(string $key, array $storeIds, CarbonInterface $from, CarbonInterface $to, Request $request): array
    {
        $this->ids = $storeIds ?: [0];
        $this->from = $from;
        $this->to = $to;

        return match ($key) {
            'daily-sales' => $this->dailySales(),
            'store-sales' => $this->storeSales(),
            'product-sales' => $this->productSales('product'),
            'group-sales' => $this->productSales($request->input('group') === 'brand' ? 'brand' : 'category'),
            'cashier-sales' => $this->cashierSales(),
            'hourly-sales' => $this->hourlySales(),
            'payment-methods' => $this->paymentMethods(),
            'sales-returns' => $this->salesReturns(),
            'discounts' => $this->discounts(),
            'top-customers' => $this->topCustomers(),
            'low-stock' => $this->lowStock(),
            'dead-stock' => $this->deadStock(),
            'stock-ledger' => $this->stockLedger(),
            'supplier-purchases' => $this->supplierPurchases(),
            'product-purchases' => $this->productPurchases(),
            'account-book' => $this->accountBook($request->integer('account_id')),
            'receivable-aging' => $this->aging('sales', 'customers', 'customer_id', 'sold_at'),
            'payable-aging' => $this->aging('purchases', 'suppliers', 'supplier_id', 'purchased_at'),
            'tax' => $this->tax(),
            'expenses' => $this->expenses(),
        };
    }

    // Sales -----------------------------------------------------------------

    /**
     * Trading figures grouped by day or by store.
     *
     * @return array<string|int, array<string, float|int>>
     */
    private function trade(string $by, CarbonInterface $from, CarbonInterface $to): array
    {
        [$saleKey, $returnKey] = $by === 'day'
            ? ['date(sales.sold_at)', 'date(sale_returns.returned_at)']
            : ['sales.store_id', 'sale_returns.store_id'];

        $sales = DB::table('sales')
            ->whereIn('sales.store_id', $this->ids)->whereBetween('sales.sold_at', [$from, $to])
            ->groupByRaw($saleKey)
            ->selectRaw("{$saleKey} as k, count(*) as invoices, sum(subtotal) as subtotal, sum(discount_amount) as order_discount, sum(tax_amount) as tax, sum(cost_total) as cost")
            ->get()->keyBy('k');

        $lineDiscounts = DB::table('sale_items')->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereIn('sales.store_id', $this->ids)->whereBetween('sales.sold_at', [$from, $to])
            ->groupByRaw($saleKey)
            ->selectRaw("{$saleKey} as k, sum(sale_items.discount_amount) as amount")
            ->pluck('amount', 'k');

        $returns = DB::table('sale_returns')
            ->whereIn('sale_returns.store_id', $this->ids)->whereBetween('sale_returns.returned_at', [$from, $to])
            ->groupByRaw($returnKey)
            ->selectRaw("{$returnKey} as k, sum(total_amount - tax_amount) as net, sum(tax_amount) as tax, sum(cost_amount) as cost")
            ->get()->keyBy('k');

        $rows = [];

        foreach ($sales->keys()->merge($returns->keys())->unique() as $k) {
            $sale = $sales->get($k);
            $return = $returns->get($k);
            $lineDiscount = (float) ($lineDiscounts[$k] ?? 0);

            $gross = (float) ($sale->subtotal ?? 0) + $lineDiscount;
            $discounts = $lineDiscount + (float) ($sale->order_discount ?? 0);
            $returned = (float) ($return->net ?? 0);
            $net = $gross - $discounts - $returned;
            $cogs = (float) ($sale->cost ?? 0) - (float) ($return->cost ?? 0);
            $invoices = (int) ($sale->invoices ?? 0);

            $rows[$k] = [
                'invoices' => $invoices,
                'gross_sales' => round($gross, 2),
                'discounts' => round($discounts, 2),
                'returns' => round($returned, 2),
                'net_sales' => round($net, 2),
                'tax' => round((float) ($sale->tax ?? 0) - (float) ($return->tax ?? 0), 2),
                'cogs' => round($cogs, 2),
                'gross_profit' => round($net - $cogs, 2),
                'average_order' => $invoices ? round($net / $invoices, 2) : 0.0,
            ];
        }

        return $rows;
    }

    private function dailySales(): array
    {
        $rows = $this->trade('day', $this->from, $this->to);
        krsort($rows);

        return ['rows' => collect($rows)->map(fn (array $row, string $day) => ['date' => $day] + $row)->values()];
    }

    private function storeSales(): array
    {
        $days = (int) $this->from->diffInDays($this->to) + 1;
        $current = $this->trade('store', $this->from, $this->to);
        $previous = $this->trade('store', $this->from->copy()->subDays($days), $this->from->copy()->subSecond());
        $names = DB::table('stores')->whereIn('id', $this->ids)->pluck('name', 'id');

        $rows = $names->map(function (string $name, int $id) use ($current, $previous) {
            $row = $current[$id] ?? ['invoices' => 0, 'gross_sales' => 0.0, 'discounts' => 0.0, 'returns' => 0.0, 'net_sales' => 0.0, 'tax' => 0.0, 'cogs' => 0.0, 'gross_profit' => 0.0, 'average_order' => 0.0];
            $before = (float) ($previous[$id]['net_sales'] ?? 0);

            return ['store' => $name] + $row + [
                'margin' => $row['net_sales'] > 0 ? round($row['gross_profit'] / $row['net_sales'] * 100, 1) : null,
                'previous_net_sales' => $before,
                'change' => $before > 0 ? round(($row['net_sales'] - $before) / $before * 100, 1) : null,
            ];
        })->sortByDesc('net_sales')->values();

        return ['rows' => $rows];
    }

    /**
     * Sales and margin per product, category or brand. Order-level discounts
     * (coupons, manual discounts) belong to the invoice and are not spread over its lines.
     */
    private function productSales(string $by): array
    {
        $query = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->leftJoin('products as p', 'p.id', '=', 'si.product_id')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->leftJoin('brands as b', 'b.id', '=', 'p.brand_id')
            ->whereIn('s.store_id', $this->ids)->whereBetween('s.sold_at', [$this->from, $this->to])
            ->selectRaw('sum(si.quantity) as qty_sold, sum(si.returned_quantity) as qty_returned')
            ->selectRaw('sum(si.quantity * si.unit_price) as gross_sales, sum(si.discount_amount) as discounts')
            ->selectRaw('sum((si.line_total - si.tax_amount) * (si.quantity - si.returned_quantity) / si.quantity) as net_sales')
            ->selectRaw('sum(si.unit_cost * (si.quantity - si.returned_quantity)) as cogs');

        $query = match ($by) {
            'product' => $query->groupBy('si.product_id')
                ->selectRaw("si.product_id, max(si.product_name) as name, max(si.sku) as sku, max(p.barcode) as barcode, coalesce(max(c.name), '—') as category"),
            'category' => $query->groupBy('c.id')->selectRaw("coalesce(max(c.name), 'Uncategorised') as name, count(distinct si.product_id) as products"),
            'brand' => $query->groupBy('b.id')->selectRaw("coalesce(max(b.name), 'No brand') as name, count(distinct si.product_id) as products"),
        };

        $rows = $query->orderByDesc('net_sales')->get()->map(function ($row) {
            $row = (array) $row;
            $net = (float) $row['net_sales'];
            $cogs = (float) $row['cogs'];

            foreach (['qty_sold', 'qty_returned', 'gross_sales', 'discounts'] as $field) {
                $row[$field] = (float) $row[$field];
            }

            return array_merge($row, [
                'net_qty' => round($row['qty_sold'] - $row['qty_returned'], 3),
                'net_sales' => round($net, 2),
                'cogs' => round($cogs, 2),
                'gross_profit' => round($net - $cogs, 2),
                'margin' => $net > 0 ? round(($net - $cogs) / $net * 100, 1) : null,
            ]);
        });

        return ['rows' => $rows];
    }

    private function cashierSales(): array
    {
        $lineDiscounts = DB::table('sale_items')->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereIn('sales.store_id', $this->ids)->whereBetween('sales.sold_at', [$this->from, $this->to])
            ->groupBy('sales.user_id')
            ->selectRaw('sales.user_id as k, sum(sale_items.discount_amount) as amount')
            ->pluck('amount', 'k');

        $rows = DB::table('sales as s')->leftJoin('users as u', 'u.id', '=', 's.user_id')
            ->whereIn('s.store_id', $this->ids)->whereBetween('s.sold_at', [$this->from, $this->to])
            ->groupBy('s.user_id')
            ->selectRaw("s.user_id, coalesce(max(u.name), 'Unknown') as cashier, count(*) as invoices")
            ->selectRaw('sum(s.total) as sales_total, sum(s.discount_amount) as order_discount, sum(s.returned_amount) as returned, sum(s.due_amount) as due')
            ->selectRaw("sum(s.discount_type in ('percent', 'fixed')) as manual_discounts")
            ->orderByDesc('sales_total')
            ->get()
            ->map(fn ($row) => [
                'cashier' => $row->cashier,
                'invoices' => (int) $row->invoices,
                'sales_total' => (float) $row->sales_total,
                'average_sale' => $row->invoices ? round($row->sales_total / $row->invoices, 2) : 0.0,
                'discounts' => round((float) $row->order_discount + (float) ($lineDiscounts[$row->user_id] ?? 0), 2),
                'manual_discounts' => (int) $row->manual_discounts,
                'returned' => (float) $row->returned,
                'due' => (float) $row->due,
            ]);

        return ['rows' => $rows];
    }

    private function hourlySales(): array
    {
        $rows = DB::table('sales')
            ->whereIn('store_id', $this->ids)->whereBetween('sold_at', [$this->from, $this->to])
            ->groupByRaw('hour(sold_at)')->orderByRaw('hour(sold_at)')
            ->selectRaw('hour(sold_at) as h, count(*) as invoices, sum(total - tax_amount) as sales')
            ->get();

        $total = (float) $rows->sum('sales');

        return ['rows' => $rows->map(fn ($row) => [
            'hour' => sprintf('%02d:00 – %02d:59', $row->h, $row->h),
            'invoices' => (int) $row->invoices,
            'sales' => (float) $row->sales,
            'average_sale' => $row->invoices ? round($row->sales / $row->invoices, 2) : 0.0,
            'share' => $total > 0 ? round($row->sales / $total * 100, 1) : null,
        ])];
    }

    private function paymentMethods(): array
    {
        $rows = DB::table('transactions as t')
            ->join('accounts as a', 'a.id', '=', 't.account_id')
            ->leftJoin('stores as st', 'st.id', '=', 't.store_id')
            ->whereIn('t.store_id', $this->ids)->whereIn('t.category', ['sale', 'sale_refund'])
            ->whereBetween('t.transacted_at', [$this->from, $this->to])
            ->groupBy('a.id', 't.store_id')
            ->selectRaw('max(a.type) as method, max(a.name) as account, max(st.name) as store')
            ->selectRaw("sum(t.category = 'sale') as payments")
            ->selectRaw("coalesce(sum(case when t.category = 'sale' then t.amount end), 0) as received")
            ->selectRaw("coalesce(sum(case when t.category = 'sale_refund' then t.amount end), 0) as refunded")
            ->orderByDesc('received')
            ->get()
            ->map(fn ($row) => [
                'method' => ['cash' => 'Cash', 'card' => 'Card', 'mobile' => 'Mobile banking', 'bank' => 'Bank transfer'][$row->method] ?? $row->method,
                'account' => $row->account,
                'store' => $row->store,
                'payments' => (int) $row->payments,
                'received' => (float) $row->received,
                'refunded' => (float) $row->refunded,
                'net' => round($row->received - $row->refunded, 2),
            ]);

        return ['rows' => $rows];
    }

    private function salesReturns(): array
    {
        $rows = DB::table('sale_returns as r')
            ->join('sales as s', 's.id', '=', 'r.sale_id')
            ->leftJoin('customers as c', 'c.id', '=', 's.customer_id')
            ->leftJoin('users as u', 'u.id', '=', 'r.user_id')
            ->leftJoin('stores as st', 'st.id', '=', 'r.store_id')
            ->whereIn('r.store_id', $this->ids)->whereBetween('r.returned_at', [$this->from, $this->to])
            ->orderByDesc('r.returned_at')
            ->selectRaw("r.reference_no, r.returned_at, s.id as sale_id, s.invoice_no, st.name as store, coalesce(c.name, 'Walk-in') as customer")
            ->selectRaw('u.name as processed_by, r.total_amount as amount, r.refund_amount as refund, r.note as reason')
            ->selectRaw("(select group_concat(concat(trim(trailing '.' from trim(trailing '0' from ri.quantity)), ' × ', si.product_name) separator ', ')
                from sale_return_items ri join sale_items si on si.id = ri.sale_item_id where ri.sale_return_id = r.id) as items")
            ->get()
            ->map(fn ($row) => ['amount' => (float) $row->amount, 'refund' => (float) $row->refund] + (array) $row);

        return ['rows' => $rows];
    }

    private function discounts(): array
    {
        $rows = DB::table('sales as s')->leftJoin('discounts as d', 'd.id', '=', 's.discount_id')
            ->whereIn('s.store_id', $this->ids)->whereBetween('s.sold_at', [$this->from, $this->to])
            ->where('s.discount_amount', '>', 0)
            ->groupBy('s.discount_type', 's.discount_id')
            ->selectRaw("s.discount_type as kind, max(d.name) as name, max(d.code) as code, count(*) as uses, sum(s.discount_amount) as amount, sum(s.total) as sales_total")
            ->get()
            ->map(fn ($row) => [
                'discount' => match ($row->kind) {
                    'coupon' => $row->code ? "{$row->name} ({$row->code})" : 'Coupon (deleted)',
                    'promo' => $row->name ?? 'Promotion (deleted)',
                    'percent' => 'Manual discount — percentage',
                    default => 'Manual discount — fixed amount',
                },
                'kind' => ['coupon' => 'Coupon', 'promo' => 'Automatic, whole order'][$row->kind] ?? 'Given by cashier',
                'uses' => (int) $row->uses,
                'amount' => (float) $row->amount,
                'sales_total' => (float) $row->sales_total,
            ]);

        $lines = DB::table('sale_items')->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereIn('sales.store_id', $this->ids)->whereBetween('sales.sold_at', [$this->from, $this->to])
            ->where('sale_items.discount_amount', '>', 0)
            ->selectRaw('count(distinct sales.id) as uses, coalesce(sum(sale_items.discount_amount), 0) as amount, coalesce(sum(sale_items.line_total), 0) as sales_total')
            ->first();

        if ($lines->amount > 0) {
            $rows->push([
                'discount' => 'Product and category promotions',
                'kind' => 'Automatic, on items',
                'uses' => (int) $lines->uses,
                'amount' => (float) $lines->amount,
                'sales_total' => (float) $lines->sales_total,
            ]);
        }

        return ['rows' => $rows->sortByDesc('amount')->values()->map(fn (array $row) => $row + [
            'average' => $row['uses'] ? round($row['amount'] / $row['uses'], 2) : 0.0,
        ])];
    }

    private function topCustomers(): array
    {
        $rows = DB::table('sales as s')->join('customers as c', 'c.id', '=', 's.customer_id')
            ->whereIn('s.store_id', $this->ids)->whereBetween('s.sold_at', [$this->from, $this->to])
            ->groupBy('c.id')
            ->selectRaw('max(c.name) as customer, max(c.phone) as phone, count(*) as invoices, sum(s.total) as revenue')
            ->selectRaw('sum(s.returned_amount) as returned, sum(s.due_amount) as due, max(s.sold_at) as last_purchase')
            ->orderByDesc('revenue')
            ->get()
            ->map(fn ($row) => [
                'customer' => $row->customer,
                'phone' => $row->phone,
                'invoices' => (int) $row->invoices,
                'revenue' => (float) $row->revenue,
                'average_sale' => round($row->revenue / $row->invoices, 2),
                'returned' => (float) $row->returned,
                'due' => (float) $row->due,
                'last_purchase' => $row->last_purchase,
            ]);

        return ['rows' => $rows];
    }

    // Inventory -------------------------------------------------------------

    /** SQL for a product's on-hand quantity within the stores in view. */
    private function onHand(): string
    {
        $ids = implode(',', array_map('intval', $this->ids));

        return "(select coalesce(sum(sl.quantity), 0) from stock_levels sl where sl.product_id = p.id and sl.store_id in ({$ids}))";
    }

    private function lowStock(): array
    {
        $onHand = $this->onHand();

        $rows = DB::table('products as p')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->leftJoin('units as u', 'u.id', '=', 'p.unit_id')
            ->whereNull('p.deleted_at')->where('p.is_active', true)
            ->whereRaw("{$onHand} <= p.reorder_level")
            ->selectRaw("p.name, p.sku, p.barcode, coalesce(c.name, '—') as category, u.short_name as unit, {$onHand} as on_hand, p.reorder_level, p.cost_price")
            ->orderByRaw("{$onHand} / greatest(p.reorder_level, 1)")
            ->get()
            ->map(function ($row) {
                $onHand = (float) $row->on_hand;
                $shortfall = max(0, (float) $row->reorder_level - $onHand);

                return [
                    'name' => $row->name, 'sku' => $row->sku, 'barcode' => $row->barcode, 'category' => $row->category, 'unit' => $row->unit,
                    'on_hand' => $onHand,
                    'reorder_level' => (float) $row->reorder_level,
                    'shortfall' => $shortfall,
                    'status' => $onHand <= 0 ? 'Out of stock' : 'Low',
                    'cost_to_refill' => round($shortfall * (float) $row->cost_price, 2),
                ];
            });

        return ['rows' => $rows];
    }

    /**
     * Stock that is sitting still: when each product in stock was last sold.
     */
    private function deadStock(): array
    {
        $onHand = $this->onHand();
        $ids = implode(',', array_map('intval', $this->ids));

        $rows = DB::table('products as p')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->leftJoin('units as u', 'u.id', '=', 'p.unit_id')
            ->whereNull('p.deleted_at')
            ->whereRaw("{$onHand} > 0")
            ->selectRaw("p.name, p.sku, coalesce(c.name, '—') as category, u.short_name as unit, {$onHand} as on_hand, p.cost_price")
            ->selectRaw("(select max(s.sold_at) from sale_items si join sales s on s.id = si.sale_id where si.product_id = p.id and s.store_id in ({$ids})) as last_sold")
            ->get()
            ->map(function ($row) {
                $days = $row->last_sold ? (int) floor(now()->diffInDays($row->last_sold, true)) : null;

                return [
                    'name' => $row->name, 'sku' => $row->sku, 'category' => $row->category, 'unit' => $row->unit,
                    'on_hand' => (float) $row->on_hand,
                    'stock_value' => round($row->on_hand * $row->cost_price, 2),
                    'last_sold' => $row->last_sold,
                    'days_idle' => $days,
                    'status' => match (true) {
                        $days === null => 'Never sold',
                        $days >= 60 => 'Dead',
                        $days >= 21 => 'Slow',
                        default => 'Moving',
                    },
                ];
            })
            // Never-sold first, then the longest idle.
            ->sortByDesc(fn (array $row) => $row['days_idle'] ?? PHP_INT_MAX)
            ->values();

        return ['rows' => $rows];
    }

    /**
     * Opening quantity, every kind of movement in the period, and the closing quantity, per product.
     */
    private function stockLedger(): array
    {
        $before = fn () => 'coalesce(sum(case when m.moved_at < ? then m.quantity end), 0)';
        $within = fn (string $types) => "coalesce(sum(case when m.moved_at >= ? and m.type in ({$types}) then m.quantity end), 0)";

        $rows = DB::table('stock_movements as m')
            ->join('products as p', 'p.id', '=', 'm.product_id')
            ->leftJoin('units as u', 'u.id', '=', 'p.unit_id')
            ->whereIn('m.store_id', $this->ids)->where('m.moved_at', '<=', $this->to)
            ->groupBy('m.product_id')
            ->selectRaw('max(p.name) as name, max(p.sku) as sku, max(u.short_name) as unit, max(p.cost_price) as cost_price')
            ->selectRaw($before().' as opening', [$this->from])
            ->selectRaw($within("'purchase'").' as purchased', [$this->from])
            ->selectRaw($within("'sale'").' as sold', [$this->from])
            ->selectRaw($within("'sale_return'").' as returned', [$this->from])
            ->selectRaw($within("'transfer_in'").' as transfer_in', [$this->from])
            ->selectRaw($within("'transfer_out'").' as transfer_out', [$this->from])
            ->selectRaw($within("'adjustment'").' as adjusted', [$this->from])
            ->selectRaw('sum(m.quantity) as closing')
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name, 'sku' => $row->sku, 'unit' => $row->unit,
                'opening' => (float) $row->opening,
                'purchased' => (float) $row->purchased,
                'sold' => abs((float) $row->sold),
                'returned' => (float) $row->returned,
                'transfer_in' => (float) $row->transfer_in,
                'transfer_out' => abs((float) $row->transfer_out),
                'adjusted' => (float) $row->adjusted,
                'closing' => (float) $row->closing,
                'closing_value' => round($row->closing * $row->cost_price, 2),
            ]);

        return ['rows' => $rows];
    }

    // Purchases -------------------------------------------------------------

    private function supplierPurchases(): array
    {
        $rows = DB::table('purchases as pu')->join('suppliers as s', 's.id', '=', 'pu.supplier_id')
            ->whereIn('pu.store_id', $this->ids)
            ->whereBetween('pu.purchased_at', [$this->from->toDateString(), $this->to->toDateString()])
            ->groupBy('s.id')
            ->selectRaw('max(s.name) as supplier, max(s.phone) as phone, count(*) as purchases, sum(pu.total) as total, sum(pu.paid_amount) as paid, sum(pu.due_amount) as due, max(pu.purchased_at) as last_purchase')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'supplier' => $row->supplier, 'phone' => $row->phone,
                'purchases' => (int) $row->purchases,
                'total' => (float) $row->total, 'paid' => (float) $row->paid, 'due' => (float) $row->due,
                'last_purchase' => $row->last_purchase,
            ]);

        return ['rows' => $rows];
    }

    /**
     * What was bought, how much, and how the unit cost moved over the period.
     */
    private function productPurchases(): array
    {
        $rows = DB::table('purchase_items as pi')
            ->join('purchases as pu', 'pu.id', '=', 'pi.purchase_id')
            ->join('products as p', 'p.id', '=', 'pi.product_id')
            ->whereIn('pu.store_id', $this->ids)
            ->whereBetween('pu.purchased_at', [$this->from->toDateString(), $this->to->toDateString()])
            ->groupBy('pi.product_id')
            ->selectRaw('max(p.name) as name, max(p.sku) as sku, count(distinct pu.id) as purchases, sum(pi.quantity) as quantity, sum(pi.line_total) as total')
            ->selectRaw('min(pi.unit_cost) as lowest_cost, max(pi.unit_cost) as highest_cost')
            ->selectRaw('substring_index(group_concat(pi.unit_cost order by pu.purchased_at desc, pu.id desc), \',\', 1) as latest_cost')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name, 'sku' => $row->sku,
                'purchases' => (int) $row->purchases,
                'quantity' => (float) $row->quantity,
                'total' => (float) $row->total,
                'average_cost' => $row->quantity > 0 ? round($row->total / $row->quantity, 2) : 0.0,
                'lowest_cost' => (float) $row->lowest_cost,
                'highest_cost' => (float) $row->highest_cost,
                'latest_cost' => (float) $row->latest_cost,
            ]);

        return ['rows' => $rows];
    }

    // Finance ---------------------------------------------------------------

    /**
     * Cash book / bank book: every movement on one account with a running balance.
     */
    private function accountBook(int $accountId): array
    {
        $accounts = Account::query()->forStores($this->ids)->orderByRaw("field(type, 'cash', 'bank', 'mobile', 'card')")->orderBy('name')->get();
        $account = $accounts->firstWhere('id', $accountId) ?? $accounts->first();

        if (! $account) {
            return ['rows' => [], 'meta' => ['opening' => 0, 'closing' => 0, 'account' => null]];
        }

        $signed = "case when direction = 'in' then amount else -amount end";

        $opening = (float) DB::table('transactions')->where('account_id', $account->id)
            ->where('transacted_at', '<', $this->from)->sum(DB::raw($signed));

        $balance = $opening;

        $rows = DB::table('transactions')->where('account_id', $account->id)
            ->whereBetween('transacted_at', [$this->from, $this->to])
            ->orderBy('transacted_at')->orderBy('id')
            ->get(['transacted_at', 'category', 'reference', 'description', 'direction', 'amount'])
            ->map(function ($row) use (&$balance) {
                $in = $row->direction === 'in' ? (float) $row->amount : 0.0;
                $out = $row->direction === 'out' ? (float) $row->amount : 0.0;
                $balance = round($balance + $in - $out, 2);

                return [
                    'date' => $row->transacted_at,
                    'description' => $row->description,
                    'reference' => $row->reference,
                    'type' => ucfirst(str_replace('_', ' ', $row->category)),
                    'money_in' => $in ?: null,
                    'money_out' => $out ?: null,
                    'balance' => $balance,
                ];
            });

        return [
            'rows' => $rows,
            'meta' => ['opening' => round($opening, 2), 'closing' => $balance, 'account' => $account->name, 'account_id' => $account->id],
        ];
    }

    /**
     * Unpaid invoices (or purchases) per customer (or supplier), split by how old they are.
     */
    private function aging(string $table, string $partyTable, string $partyKey, string $dateColumn): array
    {
        $age = "datediff(curdate(), date(d.{$dateColumn}))";
        $bucket = fn (string $condition) => "coalesce(sum(case when {$condition} then d.due_amount end), 0)";

        $rows = DB::table("{$table} as d")->join("{$partyTable} as p", 'p.id', '=', "d.{$partyKey}")
            ->whereIn('d.store_id', $this->ids)->where('d.due_amount', '>', 0)
            ->groupBy('p.id')
            ->selectRaw('max(p.name) as name, max(p.phone) as phone, count(*) as documents, min(d.'.$dateColumn.') as oldest')
            ->selectRaw($bucket("{$age} <= 30").' as current')
            ->selectRaw($bucket("{$age} between 31 and 60").' as days_31_60')
            ->selectRaw($bucket("{$age} between 61 and 90").' as days_61_90')
            ->selectRaw($bucket("{$age} > 90").' as over_90')
            ->selectRaw('sum(d.due_amount) as total')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name, 'phone' => $row->phone, 'documents' => (int) $row->documents, 'oldest' => $row->oldest,
                'current' => (float) $row->current, 'days_31_60' => (float) $row->days_31_60,
                'days_61_90' => (float) $row->days_61_90, 'over_90' => (float) $row->over_90, 'total' => (float) $row->total,
            ]);

        return ['rows' => $rows];
    }

    private function tax(): array
    {
        $rows = DB::table('sale_items as si')->join('sales as s', 's.id', '=', 'si.sale_id')
            ->whereIn('s.store_id', $this->ids)->whereBetween('s.sold_at', [$this->from, $this->to])
            ->groupBy('si.tax_rate')->orderByDesc('si.tax_rate')
            ->selectRaw('si.tax_rate, count(distinct s.id) as invoices, sum(si.line_total - si.tax_amount) as taxable, sum(si.tax_amount) as tax')
            ->get()
            ->map(fn ($row) => [
                'rate' => (float) $row->tax_rate > 0 ? rtrim(rtrim(number_format((float) $row->tax_rate, 2), '0'), '.').'%' : 'Exempt (0%)',
                'invoices' => (int) $row->invoices,
                'taxable' => (float) $row->taxable,
                'tax' => (float) $row->tax,
            ]);

        $returns = DB::table('sale_returns')
            ->whereIn('store_id', $this->ids)->whereBetween('returned_at', [$this->from, $this->to])
            ->selectRaw('count(*) as n, coalesce(sum(total_amount - tax_amount), 0) as taxable, coalesce(sum(tax_amount), 0) as tax')
            ->first();

        if ($returns->n > 0) {
            $rows->push(['rate' => 'Less: returns', 'invoices' => (int) $returns->n, 'taxable' => -(float) $returns->taxable, 'tax' => -(float) $returns->tax]);
        }

        return ['rows' => $rows];
    }

    /**
     * Everything the profit and loss statement counts as an operating expense, by category and store.
     */
    private function expenses(): array
    {
        $dates = [$this->from->toDateString(), $this->to->toDateString()];
        $stores = DB::table('stores')->pluck('name', 'id');

        $rows = DB::table('finance_entries as e')->join('finance_categories as c', 'c.id', '=', 'e.finance_category_id')
            ->where('e.type', 'expense')->whereIn('e.store_id', $this->ids)->whereBetween('e.entry_date', $dates)
            ->groupBy('c.id', 'e.store_id')
            ->selectRaw('max(c.name) as category, e.store_id, count(*) as entries, sum(e.amount) as amount')
            ->get()
            ->map(fn ($row) => ['category' => $row->category, 'store' => $stores[$row->store_id] ?? '—', 'entries' => (int) $row->entries, 'amount' => (float) $row->amount]);

        $salaries = DB::table('salary_payments')->whereIn('store_id', $this->ids)->whereBetween('paid_at', $dates)
            ->groupBy('store_id')->selectRaw('store_id, count(*) as entries, sum(net_amount) as amount')->get();

        foreach ($salaries as $row) {
            $rows->push(['category' => 'Salaries', 'store' => $stores[$row->store_id] ?? '—', 'entries' => (int) $row->entries, 'amount' => (float) $row->amount]);
        }

        $interest = DB::table('loan_payments as lp')->join('loans as l', 'l.id', '=', 'lp.loan_id')
            ->where('l.direction', 'taken')->where('lp.interest_amount', '>', 0)
            ->whereIn('lp.store_id', $this->ids)->whereBetween('lp.paid_at', $dates)
            ->groupBy('lp.store_id')->selectRaw('lp.store_id, count(*) as entries, sum(lp.interest_amount) as amount')->get();

        foreach ($interest as $row) {
            $rows->push(['category' => 'Loan interest', 'store' => $stores[$row->store_id] ?? '—', 'entries' => (int) $row->entries, 'amount' => (float) $row->amount]);
        }

        $total = (float) $rows->sum('amount');

        return ['rows' => $rows->sortByDesc('amount')->values()->map(fn (array $row) => $row + [
            'share' => $total > 0 ? round($row['amount'] / $total * 100, 1) : null,
        ])];
    }
}

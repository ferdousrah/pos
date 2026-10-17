<?php

namespace App\Services;

use App\Models\FinanceEntry;
use App\Models\Loan;
use App\Models\LoanPayment;
use App\Models\SalaryPayment;
use App\Models\Sale;
use App\Models\SaleReturn;
use Carbon\CarbonInterface;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Trading figures shared by the dashboard and the reports.
 *
 * "Net sales" is always revenue excluding tax and after discounts and returns;
 * tax collected is a liability, not income, so it never counts towards profit.
 */
class ReportService
{
    /**
     * @param  int[]  $storeIds
     * @return array<string, float|int>
     */
    public function totals(array $storeIds, CarbonInterface $from, CarbonInterface $to): array
    {
        $sales = Sale::query()
            ->whereIn('store_id', $storeIds)
            ->whereBetween('sold_at', [$from, $to])
            ->selectRaw('count(*) as orders')
            ->selectRaw('coalesce(sum(total), 0) as total')
            ->selectRaw('coalesce(sum(tax_amount), 0) as tax')
            ->selectRaw('coalesce(sum(cost_total), 0) as cost')
            ->selectRaw('coalesce(sum(discount_amount), 0) as order_discounts')
            ->first();

        $lineDiscounts = (float) DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereIn('sales.store_id', $storeIds)
            ->whereBetween('sales.sold_at', [$from, $to])
            ->sum('sale_items.discount_amount');

        $returns = SaleReturn::query()
            ->whereIn('store_id', $storeIds)
            ->whereBetween('returned_at', [$from, $to])
            ->selectRaw('coalesce(sum(total_amount), 0) as total')
            ->selectRaw('coalesce(sum(tax_amount), 0) as tax')
            ->selectRaw('coalesce(sum(cost_amount), 0) as cost')
            ->first();

        $discounts = (float) $sales->order_discounts + $lineDiscounts;
        $returnsNet = (float) $returns->total - (float) $returns->tax;
        $netSales = (float) $sales->total - (float) $sales->tax - $returnsNet;
        $cogs = (float) $sales->cost - (float) $returns->cost;

        return [
            'orders' => (int) $sales->orders,
            'gross_sales' => round($netSales + $returnsNet + $discounts, 2),
            'discounts' => round($discounts, 2),
            'returns' => round($returnsNet, 2),
            'net_sales' => round($netSales, 2),
            'tax' => round((float) $sales->tax - (float) $returns->tax, 2),
            'cogs' => round($cogs, 2),
            'gross_profit' => round($netSales - $cogs, 2),
            'average_order' => $sales->orders ? round($netSales / $sales->orders, 2) : 0.0,
        ];
    }

    /**
     * One row per day in the range, including days with no trade.
     *
     * @param  int[]  $storeIds
     * @return Collection<int, array{date: string, orders: int, sales: float, profit: float}>
     */
    public function daily(array $storeIds, CarbonInterface $from, CarbonInterface $to): Collection
    {
        $sales = Sale::query()
            ->whereIn('store_id', $storeIds)
            ->whereBetween('sold_at', [$from, $to])
            ->groupByRaw('date(sold_at)')
            ->selectRaw('date(sold_at) as day, count(*) as orders, sum(total - tax_amount) as sales, sum(total - tax_amount - cost_total) as profit')
            ->get()
            ->keyBy('day');

        $returns = SaleReturn::query()
            ->whereIn('store_id', $storeIds)
            ->whereBetween('returned_at', [$from, $to])
            ->groupByRaw('date(returned_at)')
            ->selectRaw('date(returned_at) as day, sum(total_amount - tax_amount) as sales, sum(total_amount - tax_amount - cost_amount) as profit')
            ->get()
            ->keyBy('day');

        return collect(CarbonPeriod::create($from->copy()->startOfDay(), $to->copy()->startOfDay()))
            ->map(function (CarbonInterface $day) use ($sales, $returns) {
                $key = $day->toDateString();

                return [
                    'date' => $key,
                    'orders' => (int) ($sales[$key]->orders ?? 0),
                    'sales' => round((float) ($sales[$key]->sales ?? 0) - (float) ($returns[$key]->sales ?? 0), 2),
                    'profit' => round((float) ($sales[$key]->profit ?? 0) - (float) ($returns[$key]->profit ?? 0), 2),
                ];
            })
            ->values();
    }

    /**
     * @param  int[]  $storeIds
     */
    public function topProducts(array $storeIds, CarbonInterface $from, CarbonInterface $to, int $limit = 10): Collection
    {
        return DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereIn('sales.store_id', $storeIds)
            ->whereBetween('sales.sold_at', [$from, $to])
            ->groupBy('sale_items.product_id', 'sale_items.product_name', 'sale_items.sku')
            ->orderByDesc('revenue')
            ->limit($limit)
            ->get([
                'sale_items.product_id',
                'sale_items.product_name as name',
                'sale_items.sku',
                DB::raw('sum(sale_items.quantity - sale_items.returned_quantity) as quantity'),
                DB::raw('sum(sale_items.line_total - sale_items.tax_amount) as revenue'),
                DB::raw('sum(sale_items.line_total - sale_items.tax_amount - sale_items.unit_cost * sale_items.quantity) as profit'),
            ])
            ->map(fn ($row) => [
                'product_id' => $row->product_id,
                'name' => $row->name,
                'sku' => $row->sku,
                'quantity' => (float) $row->quantity,
                'revenue' => (float) $row->revenue,
                'profit' => (float) $row->profit,
            ]);
    }

    /**
     * Sales revenue (ex. tax) grouped by a dimension of the sale.
     *
     * @param  int[]  $storeIds
     */
    public function salesBy(string $dimension, array $storeIds, CarbonInterface $from, CarbonInterface $to): Collection
    {
        $query = DB::table('sales')
            ->whereIn('sales.store_id', $storeIds)
            ->whereBetween('sales.sold_at', [$from, $to]);

        if ($dimension === 'category') {
            return $query
                ->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')
                ->join('products', 'products.id', '=', 'sale_items.product_id')
                ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
                ->groupBy('categories.id', 'categories.name')
                ->orderByDesc('amount')
                ->get([
                    DB::raw("coalesce(categories.name, 'Uncategorised') as name"),
                    DB::raw('sum(sale_items.quantity) as orders'),
                    DB::raw('sum(sale_items.line_total - sale_items.tax_amount) as amount'),
                ])
                ->map(fn ($row) => ['name' => $row->name, 'orders' => (float) $row->orders, 'amount' => (float) $row->amount]);
        }

        [$table, $key, $label] = match ($dimension) {
            'store' => ['stores', 'sales.store_id', 'stores.name'],
            'cashier' => ['users', 'sales.user_id', 'users.name'],
        };

        return $query
            ->leftJoin($table, "{$table}.id", '=', $key)
            ->groupBy($key, $label)
            ->orderByDesc('amount')
            ->get([
                DB::raw("coalesce({$label}, 'Unknown') as name"),
                DB::raw('count(*) as orders'),
                DB::raw('sum(sales.total - sales.tax_amount) as amount'),
            ])
            ->map(fn ($row) => ['name' => $row->name, 'orders' => (int) $row->orders, 'amount' => (float) $row->amount]);
    }

    /**
     * Money actually received from customers, by the kind of account it landed in.
     *
     * @param  int[]  $storeIds
     */
    public function paymentMix(array $storeIds, CarbonInterface $from, CarbonInterface $to): Collection
    {
        return DB::table('transactions')
            ->join('accounts', 'accounts.id', '=', 'transactions.account_id')
            ->whereIn('transactions.store_id', $storeIds)
            ->where('transactions.category', 'sale')
            ->whereBetween('transactions.transacted_at', [$from, $to])
            ->groupBy('accounts.type')
            ->orderByDesc('amount')
            ->get(['accounts.type as name', DB::raw('sum(transactions.amount) as amount'), DB::raw('count(*) as orders')])
            ->map(fn ($row) => ['name' => $row->name, 'orders' => (int) $row->orders, 'amount' => (float) $row->amount]);
    }

    /**
     * @param  int[]  $storeIds
     * @return Collection<int, array{name: string, amount: float}>
     */
    public function financeByCategory(string $type, array $storeIds, CarbonInterface $from, CarbonInterface $to): Collection
    {
        return FinanceEntry::query()
            ->join('finance_categories', 'finance_categories.id', '=', 'finance_entries.finance_category_id')
            ->where('finance_entries.type', $type)
            ->whereIn('finance_entries.store_id', $storeIds)
            ->whereBetween('finance_entries.entry_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('finance_categories.name')
            ->orderByDesc('amount')
            ->get(['finance_categories.name', DB::raw('sum(finance_entries.amount) as amount')])
            ->map(fn ($row) => ['name' => $row->name, 'amount' => (float) $row->amount]);
    }

    /**
     * @param  int[]  $storeIds
     */
    public function salaries(array $storeIds, CarbonInterface $from, CarbonInterface $to): float
    {
        return (float) SalaryPayment::query()
            ->whereIn('store_id', $storeIds)
            ->whereBetween('paid_at', [$from->toDateString(), $to->toDateString()])
            ->sum('net_amount');
    }

    /**
     * Interest on loans in a period: paid on money borrowed (an expense) or
     * received on money lent (income). Principal never counts towards profit.
     *
     * @param  int[]  $storeIds
     */
    public function loanInterest(string $direction, array $storeIds, CarbonInterface $from, CarbonInterface $to): float
    {
        return (float) LoanPayment::query()
            ->join('loans', 'loans.id', '=', 'loan_payments.loan_id')
            ->where('loans.direction', $direction)
            ->whereIn('loan_payments.store_id', $storeIds)
            ->whereBetween('loan_payments.paid_at', [$from->toDateString(), $to->toDateString()])
            ->sum('loan_payments.interest_amount');
    }

    /**
     * What is still owed on loans right now, in each direction.
     *
     * @param  int[]  $storeIds
     * @return array{payable: float, receivable: float}
     */
    public function loanBalances(array $storeIds): array
    {
        $row = Loan::query()
            ->whereIn('store_id', $storeIds)
            ->selectRaw("coalesce(sum(case when direction = 'taken' then principal - principal_repaid end), 0) as payable")
            ->selectRaw("coalesce(sum(case when direction = 'given' then principal - principal_repaid end), 0) as receivable")
            ->first();

        return ['payable' => (float) $row->payable, 'receivable' => (float) $row->receivable];
    }

    /**
     * @param  int[]  $storeIds
     */
    public function profitAndLoss(array $storeIds, CarbonInterface $from, CarbonInterface $to): array
    {
        $trading = $this->totals($storeIds, $from, $to);
        $income = $this->financeByCategory(FinanceEntry::INCOME, $storeIds, $from, $to);
        $expenses = $this->financeByCategory(FinanceEntry::EXPENSE, $storeIds, $from, $to);
        $salaries = $this->salaries($storeIds, $from, $to);

        if ($salaries > 0) {
            $expenses = $expenses->push(['name' => 'Salaries', 'amount' => $salaries]);
        }

        if (($interestPaid = $this->loanInterest(Loan::TAKEN, $storeIds, $from, $to)) > 0) {
            $expenses = $expenses->push(['name' => 'Loan interest', 'amount' => $interestPaid]);
        }

        if (($interestEarned = $this->loanInterest(Loan::GIVEN, $storeIds, $from, $to)) > 0) {
            $income = $income->push(['name' => 'Loan interest', 'amount' => $interestEarned]);
        }

        $expenses = $expenses->sortByDesc('amount')->values();
        $income = $income->sortByDesc('amount')->values();

        $totalIncome = (float) $income->sum('amount');
        $totalExpenses = (float) $expenses->sum('amount');

        return [
            'trading' => $trading,
            'other_income' => $income,
            'expenses' => $expenses,
            'total_other_income' => round($totalIncome, 2),
            'total_expenses' => round($totalExpenses, 2),
            'net_profit' => round($trading['gross_profit'] + $totalIncome - $totalExpenses, 2),
            'loans' => $this->loanBalances($storeIds),
        ];
    }
}

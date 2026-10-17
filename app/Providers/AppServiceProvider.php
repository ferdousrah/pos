<?php

namespace App\Providers;

use App\Models;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(StoreContext::class);
    }

    public function boot(): void
    {
        // Every write goes through validated request data, so mass-assignment guarding adds nothing here.
        Model::unguard();

        Relation::enforceMorphMap([
            'user' => Models\User::class,
            'sale' => Models\Sale::class,
            'sale_return' => Models\SaleReturn::class,
            'purchase' => Models\Purchase::class,
            'finance_entry' => Models\FinanceEntry::class,
            'salary_payment' => Models\SalaryPayment::class,
            'stock_adjustment' => Models\StockAdjustment::class,
            'stock_transfer' => Models\StockTransfer::class,
            'loan' => Models\Loan::class,
            'loan_payment' => Models\LoanPayment::class,
        ]);
    }
}

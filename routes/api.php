<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DiscountController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\FinanceController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LoanController;
use App\Http\Controllers\Api\PosController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SaleController;
use Illuminate\Support\Facades\Route;

Route::post('login', [AuthController::class, 'login'])->middleware('throttle:8,1');

Route::middleware(['auth', 'store'])->group(function () {
    Route::get('me', [AuthController::class, 'me']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::put('me/password', [AuthController::class, 'updatePassword']);

    Route::get('dashboard', DashboardController::class)->middleware('permission:dashboard.view');

    // Pickers used across many screens; anyone signed in may read them.
    Route::get('products/lookup', [ProductController::class, 'lookup']);
    Route::get('products/options', [ProductController::class, 'options']);
    Route::get('accounts/options', [AccountController::class, 'options']);
    Route::get('{type}/options', [ContactController::class, 'options'])->whereIn('type', ['customers', 'suppliers']);

    // Register
    Route::middleware('permission:pos.access')->group(function () {
        Route::get('pos/bootstrap', [PosController::class, 'bootstrap']);
        Route::get('pos/products', [PosController::class, 'products']);
        Route::post('pos/coupon', [PosController::class, 'coupon']);
        Route::post('sales', [SaleController::class, 'store']);
    });

    // Sales
    Route::middleware('permission:sales.view,pos.access')->group(function () {
        Route::get('sales', [SaleController::class, 'index']);
        Route::get('sales/{sale}', [SaleController::class, 'show']);
    });
    Route::middleware('permission:sales.manage')->group(function () {
        Route::post('sales/{sale}/payments', [SaleController::class, 'collect']);
        Route::post('sales/{sale}/returns', [SaleController::class, 'refund']);
    });

    // Purchases
    Route::middleware('permission:purchases.view')->group(function () {
        Route::get('purchases', [PurchaseController::class, 'index']);
        Route::get('purchases/{purchase}', [PurchaseController::class, 'show']);
    });
    Route::middleware('permission:purchases.manage')->group(function () {
        Route::post('purchases', [PurchaseController::class, 'store']);
        Route::post('purchases/{purchase}/payments', [PurchaseController::class, 'pay']);
    });

    // Catalogue
    Route::get('products', [ProductController::class, 'index'])->middleware('permission:products.view');
    Route::get('catalog/{type}', [CatalogController::class, 'index'])->middleware('permission:products.view');
    Route::middleware('permission:products.manage')->group(function () {
        Route::post('products', [ProductController::class, 'store']);
        Route::put('products/{product}', [ProductController::class, 'update']);
        Route::delete('products/{product}', [ProductController::class, 'destroy']);
        Route::post('products/{product}/image', [ProductController::class, 'storeImage']);
        Route::delete('products/{product}/image', [ProductController::class, 'destroyImage']);
        Route::post('catalog/{type}', [CatalogController::class, 'store']);
        Route::put('catalog/{type}/{id}', [CatalogController::class, 'update']);
        Route::delete('catalog/{type}/{id}', [CatalogController::class, 'destroy']);
    });

    // Inventory
    Route::middleware('permission:inventory.view')->group(function () {
        Route::get('inventory/stock', [InventoryController::class, 'stock']);
        Route::get('inventory/movements', [InventoryController::class, 'movements']);
        Route::get('inventory/adjustments', [InventoryController::class, 'adjustments']);
        Route::get('inventory/transfers', [InventoryController::class, 'transfers']);
    });
    Route::post('inventory/adjustments', [InventoryController::class, 'storeAdjustment'])->middleware('permission:inventory.adjust');
    Route::post('inventory/transfers', [InventoryController::class, 'storeTransfer'])->middleware('permission:inventory.transfer');

    // Customers and suppliers
    foreach (['customers', 'suppliers'] as $type) {
        Route::middleware("permission:{$type}.view")->group(function () use ($type) {
            Route::get($type, [ContactController::class, 'index'])->defaults('type', $type);
            Route::get("{$type}/{id}", [ContactController::class, 'show'])->defaults('type', $type)->whereNumber('id');
        });
        // The cashier can add a walk-in customer on the spot without full customer management rights.
        Route::post($type, [ContactController::class, 'store'])->defaults('type', $type)
            ->middleware($type === 'customers' ? 'permission:customers.manage,pos.access' : 'permission:suppliers.manage');
        Route::middleware("permission:{$type}.manage")->group(function () use ($type) {
            Route::put("{$type}/{id}", [ContactController::class, 'update'])->defaults('type', $type)->whereNumber('id');
            Route::delete("{$type}/{id}", [ContactController::class, 'destroy'])->defaults('type', $type)->whereNumber('id');
        });
    }

    // Accounts
    Route::middleware('permission:accounts.view')->group(function () {
        Route::get('accounts', [AccountController::class, 'index']);
        Route::get('transactions', [AccountController::class, 'transactions']);
    });
    Route::middleware('permission:accounts.manage')->group(function () {
        Route::post('accounts', [AccountController::class, 'store']);
        Route::put('accounts/{account}', [AccountController::class, 'update']);
        Route::post('accounts/transfer', [AccountController::class, 'transfer']);
    });

    // Loans (borrowed and lent)
    Route::middleware('permission:accounts.view')->group(function () {
        Route::get('loans', [LoanController::class, 'index']);
        Route::get('loans/{loan}', [LoanController::class, 'show']);
    });
    Route::middleware('permission:accounts.manage')->group(function () {
        Route::post('loans', [LoanController::class, 'store']);
        Route::delete('loans/{loan}', [LoanController::class, 'destroy']);
        Route::post('loans/{loan}/payments', [LoanController::class, 'pay']);
        Route::delete('loans/{loan}/payments/{payment}', [LoanController::class, 'destroyPayment']);
    });

    // Expenses and other income
    Route::prefix('finance/{type}')->whereIn('type', ['expenses', 'income'])->group(function () {
        Route::get('categories', [FinanceController::class, 'categories']);
        Route::get('/', [FinanceController::class, 'index'])->middleware('permission:finance.view');

        Route::middleware('permission:finance.manage')->group(function () {
            Route::post('/', [FinanceController::class, 'store']);
            Route::put('{entry}', [FinanceController::class, 'update'])->whereNumber('entry');
            Route::delete('{entry}', [FinanceController::class, 'destroy'])->whereNumber('entry');
            Route::post('categories', [FinanceController::class, 'storeCategory']);
            Route::put('categories/{category}', [FinanceController::class, 'updateCategory']);
            Route::delete('categories/{category}', [FinanceController::class, 'destroyCategory']);
        });
    });

    // Discounts
    Route::middleware('permission:discounts.view')->group(function () {
        Route::get('discounts', [DiscountController::class, 'index']);
        Route::get('discounts/{discount}', [DiscountController::class, 'show']);
    });
    Route::middleware('permission:discounts.manage')->group(function () {
        Route::post('discounts', [DiscountController::class, 'store']);
        Route::put('discounts/{discount}', [DiscountController::class, 'update']);
        Route::delete('discounts/{discount}', [DiscountController::class, 'destroy']);
    });

    // Employees and payroll
    Route::middleware('permission:employees.view')->group(function () {
        Route::get('employees', [EmployeeController::class, 'index']);
        Route::get('payroll', [EmployeeController::class, 'payroll']);
    });
    Route::middleware('permission:employees.manage')->group(function () {
        Route::post('employees', [EmployeeController::class, 'store']);
        Route::put('employees/{employee}', [EmployeeController::class, 'update']);
        Route::delete('employees/{employee}', [EmployeeController::class, 'destroy']);
    });
    Route::middleware('permission:payroll.manage')->group(function () {
        Route::post('payroll', [EmployeeController::class, 'pay']);
        Route::delete('payroll/{payment}', [EmployeeController::class, 'voidPayment']);
    });

    // Reports
    Route::middleware('permission:reports.view')->prefix('reports')->group(function () {
        Route::get('sales', [ReportController::class, 'sales']);
        Route::get('profit-loss', [ReportController::class, 'profitAndLoss']);
        Route::get('stock', [ReportController::class, 'stock']);
        Route::get('library/{key}', [ReportController::class, 'library']);
    });

    // Administration
    Route::middleware('permission:stores.manage')->group(function () {
        Route::get('stores', [AdminController::class, 'stores']);
        Route::post('stores', [AdminController::class, 'storeStore']);
        Route::put('stores/{store}', [AdminController::class, 'updateStore']);
    });
    Route::get('users/options', [AdminController::class, 'userOptions'])->middleware('permission:users.manage,employees.manage');
    Route::middleware('permission:users.manage')->group(function () {
        Route::get('users', [AdminController::class, 'users']);
        Route::post('users', [AdminController::class, 'storeUser']);
        Route::put('users/{user}', [AdminController::class, 'updateUser']);
        Route::get('roles', [AdminController::class, 'roles']);
        Route::post('roles', [AdminController::class, 'storeRole']);
        Route::put('roles/{role}', [AdminController::class, 'updateRole']);
        Route::delete('roles/{role}', [AdminController::class, 'destroyRole']);
    });
    Route::middleware('permission:settings.manage')->group(function () {
        Route::get('settings', [AdminController::class, 'settings']);
        Route::put('settings', [AdminController::class, 'updateSettings']);
    });
});

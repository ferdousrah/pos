<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Store;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    /**
     * Safe to run on every deploy: it only acts on an empty database.
     *
     *  1. Roles are created once.
     *  2. If there are no users yet, either the demo business is loaded
     *     (KONTOR_SEED_DEMO, on by default locally) or the first owner and store
     *     are created from the KONTOR_ADMIN_* / KONTOR_STORE_* settings.
     */
    public function run(): void
    {
        if (! Role::query()->exists()) {
            $this->roles();
        }

        if (User::query()->exists()) {
            return;
        }

        if (config('kontor.seed_demo')) {
            Setting::put([
                'business_name' => 'Kontor Retail Ltd.',
                'business_phone' => '+880 1711-000000',
                'business_address' => 'House 12, Road 27, Dhanmondi, Dhaka 1209',
            ]);

            $this->call(DemoSeeder::class);

            return;
        }

        $this->firstOwner();
    }

    private function roles(): void
    {
        $all = Permissions::keys();
        $without = fn (array $keys) => array_values(array_diff($all, $keys));

        Role::query()->create([
            'name' => 'Owner',
            'description' => 'Unrestricted access to every store and setting.',
            'permissions' => ['*'],
            'is_system' => true,
        ]);

        Role::query()->create([
            'name' => 'Store manager',
            'description' => 'Runs one or more stores day to day.',
            'permissions' => $without(['stores.all', 'stores.manage', 'users.manage', 'settings.manage']),
        ]);

        Role::query()->create([
            'name' => 'Cashier',
            'description' => 'Sells at the register and looks up past invoices.',
            'permissions' => ['pos.access', 'sales.view', 'customers.view', 'products.view'],
        ]);

        Role::query()->create([
            'name' => 'Accountant',
            'description' => 'Keeps the books: payments, expenses, payroll and reports.',
            'permissions' => [
                'dashboard.view', 'sales.view', 'sales.manage', 'purchases.view', 'purchases.manage',
                'customers.view', 'suppliers.view', 'accounts.view', 'accounts.manage', 'finance.view',
                'finance.manage', 'employees.view', 'payroll.manage', 'reports.view', 'stores.all',
            ],
        ]);
    }

    /**
     * The owner account and the first store of a brand-new installation.
     */
    private function firstOwner(): void
    {
        $admin = config('kontor.admin');

        if (blank($admin['email']) || blank($admin['password']) || strlen((string) $admin['password']) < 8) {
            $this->command?->error('No owner account was created. Set KONTOR_ADMIN_EMAIL and KONTOR_ADMIN_PASSWORD (8+ characters), then redeploy or run `php artisan db:seed --force`.');

            return;
        }

        DB::transaction(function () use ($admin) {
            $store = Store::query()->create([
                'name' => config('kontor.store.name'),
                'code' => strtoupper(substr((string) config('kontor.store.code'), 0, 6)),
            ]);

            // A register cannot take cash without a drawer to put it in.
            Account::query()->create(['store_id' => $store->id, 'name' => 'Cash drawer', 'type' => 'cash']);

            User::query()->create([
                'name' => $admin['name'],
                'email' => $admin['email'],
                'password' => $admin['password'],
                'role_id' => Role::query()->where('name', 'Owner')->value('id'),
            ]);

            Setting::put(['business_name' => config('kontor.business_name')]);
        });

        $this->command?->info("Owner account {$admin['email']} and store \"".config('kontor.store.name').'" created.');
    }
}

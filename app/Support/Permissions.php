<?php

namespace App\Support;

/**
 * The single catalogue of permissions. Roles store a subset of these keys
 * (or "*" for unrestricted access); the role editor renders this list as-is.
 */
class Permissions
{
    public const GROUPS = [
        'Dashboard' => [
            'dashboard.view' => 'View the dashboard',
        ],
        'Point of sale' => [
            'pos.access' => 'Sell at the register',
            'sales.discount' => 'Give manual discounts',
        ],
        'Sales' => [
            'sales.view' => 'View sales and invoices',
            'sales.manage' => 'Collect dues and process returns',
        ],
        'Purchases' => [
            'purchases.view' => 'View purchases',
            'purchases.manage' => 'Record purchases and pay suppliers',
        ],
        'Products' => [
            'products.view' => 'View the catalogue',
            'products.manage' => 'Create and edit products',
        ],
        'Inventory' => [
            'inventory.view' => 'View stock and movements',
            'inventory.adjust' => 'Adjust stock',
            'inventory.transfer' => 'Transfer stock between stores',
        ],
        'Customers' => [
            'customers.view' => 'View customers',
            'customers.manage' => 'Create and edit customers',
        ],
        'Suppliers' => [
            'suppliers.view' => 'View suppliers',
            'suppliers.manage' => 'Create and edit suppliers',
        ],
        'Accounts' => [
            'accounts.view' => 'View accounts and transactions',
            'accounts.manage' => 'Manage accounts and move money',
            'finance.view' => 'View expenses and income',
            'finance.manage' => 'Record expenses and income',
        ],
        'Discounts' => [
            'discounts.view' => 'View discounts',
            'discounts.manage' => 'Create and edit discounts',
        ],
        'Employees' => [
            'employees.view' => 'View employees',
            'employees.manage' => 'Create and edit employees',
            'payroll.manage' => 'Pay salaries',
        ],
        'Reports' => [
            'reports.view' => 'View reports',
        ],
        'Administration' => [
            'stores.all' => 'Access every store',
            'stores.manage' => 'Manage stores',
            'users.manage' => 'Manage users and roles',
            'settings.manage' => 'Change business settings',
        ],
    ];

    public static function keys(): array
    {
        return array_merge(...array_values(array_map('array_keys', self::GROUPS)));
    }
}

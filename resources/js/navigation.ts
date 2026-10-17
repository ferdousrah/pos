import {
    ArrowDownToLine,
    ArrowUpFromLine,
    BadgePercent,
    ChartNoAxesColumn,
    Contact,
    HandCoins,
    Landmark,
    LayoutGrid,
    Package,
    ReceiptText,
    Settings,
    Truck,
    Users,
    Warehouse,
    type LucideIcon,
} from 'lucide-react';

export interface NavItem {
    to: string;
    label: string;
    icon: LucideIcon;
    /** Shown to anyone holding at least one of these. */
    permissions: string[];
}

export const navigation: { label: string | null; items: NavItem[] }[] = [
    {
        label: null,
        items: [{ to: '/', label: 'Overview', icon: LayoutGrid, permissions: ['dashboard.view'] }],
    },
    {
        label: 'Selling',
        items: [
            { to: '/sales', label: 'Sales', icon: ReceiptText, permissions: ['sales.view', 'pos.access'] },
            { to: '/customers', label: 'Customers', icon: Users, permissions: ['customers.view'] },
            { to: '/discounts', label: 'Discounts', icon: BadgePercent, permissions: ['discounts.view'] },
        ],
    },
    {
        label: 'Stock',
        items: [
            { to: '/products', label: 'Products', icon: Package, permissions: ['products.view'] },
            { to: '/inventory', label: 'Inventory', icon: Warehouse, permissions: ['inventory.view'] },
            { to: '/purchases', label: 'Purchases', icon: Truck, permissions: ['purchases.view'] },
            { to: '/suppliers', label: 'Suppliers', icon: Contact, permissions: ['suppliers.view'] },
        ],
    },
    {
        label: 'Money',
        items: [
            { to: '/accounts', label: 'Accounts', icon: Landmark, permissions: ['accounts.view'] },
            { to: '/loans', label: 'Loans', icon: HandCoins, permissions: ['accounts.view'] },
            { to: '/expenses', label: 'Expenses', icon: ArrowUpFromLine, permissions: ['finance.view'] },
            { to: '/income', label: 'Other income', icon: ArrowDownToLine, permissions: ['finance.view'] },
            { to: '/reports', label: 'Reports', icon: ChartNoAxesColumn, permissions: ['reports.view'] },
        ],
    },
    {
        label: 'Organisation',
        items: [
            { to: '/employees', label: 'Employees', icon: Users, permissions: ['employees.view'] },
            { to: '/settings', label: 'Settings', icon: Settings, permissions: ['settings.manage', 'stores.manage', 'users.manage'] },
        ],
    },
];

export const settingsTabs = [
    { to: '/settings', label: 'Business', end: true, permission: 'settings.manage' },
    { to: '/settings/stores', label: 'Stores', permission: 'stores.manage' },
    { to: '/settings/users', label: 'Users', permission: 'users.manage' },
    { to: '/settings/roles', label: 'Roles', permission: 'users.manage' },
];

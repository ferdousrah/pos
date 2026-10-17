export const reportTabs = [
    { to: '/reports', label: 'Sales', end: true },
    { to: '/reports/profit-loss', label: 'Profit and loss' },
    { to: '/reports/stock', label: 'Stock value' },
    { to: '/reports/library', label: 'All reports' },
];

export interface TradingTotals {
    orders: number;
    gross_sales: number;
    discounts: number;
    returns: number;
    net_sales: number;
    tax: number;
    cogs: number;
    gross_profit: number;
    average_order: number;
}

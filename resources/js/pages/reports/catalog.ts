/**
 * Every tabular report: what it is called, which filters it takes and how each column is shown.
 * The data comes from App\Services\ReportLibrary under the same key.
 */

export type ColumnKind = 'text' | 'mono' | 'money' | 'qty' | 'int' | 'percent' | 'date' | 'datetime';

export interface ReportColumn {
    key: string;
    label: string;
    kind?: ColumnKind;
    /** Add this column up in the totals row. */
    sum?: boolean;
    /** Colour negative/positive values (used for change %). */
    signed?: boolean;
}

export interface ReportDefinition {
    key: string;
    title: string;
    group: 'Sales' | 'Inventory' | 'Purchases' | 'Money' | 'Customers';
    description: string;
    /** False for "as of now" reports that ignore the date range. */
    ranged?: boolean;
    defaultRange?: string;
    /** An extra choice shown next to the date range. */
    option?: { param: string; label: string; choices: { value: string; label: string }[] } | { param: 'account_id'; label: string; accounts: true };
    columns: ReportColumn[];
    /** Builds the link a row drills down to. */
    link?: (row: Record<string, unknown>) => string | null;
    /** A fixed note under the table explaining how a figure is worked out. */
    note?: string;
}

const trading: ReportColumn[] = [
    { key: 'invoices', label: 'Invoices', kind: 'int', sum: true },
    { key: 'gross_sales', label: 'Gross sales', kind: 'money', sum: true },
    { key: 'discounts', label: 'Discounts', kind: 'money', sum: true },
    { key: 'returns', label: 'Returns', kind: 'money', sum: true },
    { key: 'net_sales', label: 'Net sales', kind: 'money', sum: true },
    { key: 'tax', label: 'Tax', kind: 'money', sum: true },
];

const productFigures: ReportColumn[] = [
    { key: 'qty_sold', label: 'Sold', kind: 'qty', sum: true },
    { key: 'qty_returned', label: 'Returned', kind: 'qty', sum: true },
    { key: 'net_qty', label: 'Net qty', kind: 'qty', sum: true },
    { key: 'gross_sales', label: 'Gross sales', kind: 'money', sum: true },
    { key: 'discounts', label: 'Discounts', kind: 'money', sum: true },
    { key: 'net_sales', label: 'Net sales', kind: 'money', sum: true },
    { key: 'cogs', label: 'Cost', kind: 'money', sum: true },
    { key: 'gross_profit', label: 'Profit', kind: 'money', sum: true },
    { key: 'margin', label: 'Margin', kind: 'percent' },
];

const lineNote = 'Coupons and whole-order discounts belong to the invoice and are not spread across its items, so the totals here can be slightly above net sales on the daily summary.';

const aging: ReportColumn[] = [
    { key: 'documents', label: 'Unpaid', kind: 'int', sum: true },
    { key: 'oldest', label: 'Oldest', kind: 'date' },
    { key: 'current', label: '0–30 days', kind: 'money', sum: true },
    { key: 'days_31_60', label: '31–60 days', kind: 'money', sum: true },
    { key: 'days_61_90', label: '61–90 days', kind: 'money', sum: true },
    { key: 'over_90', label: 'Over 90 days', kind: 'money', sum: true },
    { key: 'total', label: 'Total due', kind: 'money', sum: true },
];

export const reports: ReportDefinition[] = [
    // Sales
    {
        key: 'daily-sales',
        title: 'Daily sales summary',
        group: 'Sales',
        description: 'Gross sales, discounts, returns, tax and net sales for each day.',
        columns: [{ key: 'date', label: 'Date', kind: 'date' }, ...trading, { key: 'gross_profit', label: 'Profit', kind: 'money', sum: true }, { key: 'average_order', label: 'Avg. sale', kind: 'money' }],
        note: 'Net sales = gross sales − discounts − returns, excluding tax. Returns are counted on the day they were returned.',
    },
    {
        key: 'store-sales',
        title: 'Store-wise sales',
        group: 'Sales',
        description: 'Each store side by side, with profit and the change from the period before.',
        columns: [
            { key: 'store', label: 'Store' },
            ...trading,
            { key: 'gross_profit', label: 'Profit', kind: 'money', sum: true },
            { key: 'margin', label: 'Margin', kind: 'percent' },
            { key: 'average_order', label: 'Avg. sale', kind: 'money' },
            { key: 'previous_net_sales', label: 'Previous period', kind: 'money', sum: true },
            { key: 'change', label: 'Change', kind: 'percent', signed: true },
        ],
        note: 'Stock moved between stores is an internal transfer and is never counted as a sale or a purchase. "Previous period" is the same number of days immediately before the range.',
    },
    {
        key: 'product-sales',
        title: 'Product-wise sales and profit',
        group: 'Sales',
        description: 'Quantity, sales, cost and margin for every product sold.',
        columns: [{ key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU', kind: 'mono' }, { key: 'category', label: 'Category' }, ...productFigures],
        note: lineNote,
    },
    {
        key: 'group-sales',
        title: 'Category and brand sales',
        group: 'Sales',
        description: 'The same figures rolled up by category or by brand.',
        option: { param: 'group', label: 'Group by', choices: [{ value: 'category', label: 'Category' }, { value: 'brand', label: 'Brand' }] },
        columns: [{ key: 'name', label: 'Name' }, { key: 'products', label: 'Products', kind: 'int' }, ...productFigures],
        note: lineNote,
    },
    {
        key: 'cashier-sales',
        title: 'Cashier-wise sales',
        group: 'Sales',
        description: 'What each person rang up, the discounts they gave and what was returned.',
        columns: [
            { key: 'cashier', label: 'Cashier' },
            { key: 'invoices', label: 'Invoices', kind: 'int', sum: true },
            { key: 'sales_total', label: 'Sales (incl. tax)', kind: 'money', sum: true },
            { key: 'average_sale', label: 'Avg. sale', kind: 'money' },
            { key: 'discounts', label: 'Discounts', kind: 'money', sum: true },
            { key: 'manual_discounts', label: 'Manual discounts', kind: 'int', sum: true },
            { key: 'returned', label: 'Returned', kind: 'money', sum: true },
            { key: 'due', label: 'Sold on credit', kind: 'money', sum: true },
        ],
    },
    {
        key: 'hourly-sales',
        title: 'Hourly sales',
        group: 'Sales',
        description: 'Which hours of the day are busiest.',
        columns: [
            { key: 'hour', label: 'Hour' },
            { key: 'invoices', label: 'Invoices', kind: 'int', sum: true },
            { key: 'sales', label: 'Sales (excl. tax)', kind: 'money', sum: true },
            { key: 'average_sale', label: 'Avg. sale', kind: 'money' },
            { key: 'share', label: 'Share of sales', kind: 'percent' },
        ],
    },
    {
        key: 'payment-methods',
        title: 'Payment methods',
        group: 'Sales',
        description: 'Money received from customers by method, account and store.',
        columns: [
            { key: 'method', label: 'Method' },
            { key: 'account', label: 'Account' },
            { key: 'store', label: 'Store' },
            { key: 'payments', label: 'Payments', kind: 'int', sum: true },
            { key: 'received', label: 'Received', kind: 'money', sum: true },
            { key: 'refunded', label: 'Refunded', kind: 'money', sum: true },
            { key: 'net', label: 'Net', kind: 'money', sum: true },
        ],
        note: 'Counts money actually received in the period, including dues collected on older invoices. Sales made on credit appear here only once they are paid.',
    },
    {
        key: 'sales-returns',
        title: 'Sales returns and refunds',
        group: 'Sales',
        description: 'Every return: the invoice, what came back, why, and what was refunded.',
        columns: [
            { key: 'reference_no', label: 'Return', kind: 'mono' },
            { key: 'returned_at', label: 'Date', kind: 'datetime' },
            { key: 'invoice_no', label: 'Invoice', kind: 'mono' },
            { key: 'store', label: 'Store' },
            { key: 'customer', label: 'Customer' },
            { key: 'items', label: 'Items returned' },
            { key: 'reason', label: 'Reason' },
            { key: 'processed_by', label: 'Processed by' },
            { key: 'amount', label: 'Value', kind: 'money', sum: true },
            { key: 'refund', label: 'Refunded', kind: 'money', sum: true },
        ],
        link: (row) => (row.sale_id ? `/sales/${row.sale_id}` : null),
        note: 'Value above the refund was taken off an unpaid balance instead of being paid back.',
    },
    {
        key: 'discounts',
        title: 'Discounts given',
        group: 'Sales',
        description: 'How much each coupon, promotion and manual discount cost you.',
        columns: [
            { key: 'discount', label: 'Discount' },
            { key: 'kind', label: 'Type' },
            { key: 'uses', label: 'Invoices', kind: 'int', sum: true },
            { key: 'amount', label: 'Discount given', kind: 'money', sum: true },
            { key: 'average', label: 'Avg. per invoice', kind: 'money' },
            { key: 'sales_total', label: 'Sales on those invoices', kind: 'money' },
        ],
    },

    // Customers
    {
        key: 'top-customers',
        title: 'Top customers',
        group: 'Customers',
        description: 'Named customers ranked by what they spent in the period.',
        columns: [
            { key: 'customer', label: 'Customer' },
            { key: 'phone', label: 'Phone', kind: 'mono' },
            { key: 'invoices', label: 'Invoices', kind: 'int', sum: true },
            { key: 'revenue', label: 'Spent', kind: 'money', sum: true },
            { key: 'average_sale', label: 'Avg. sale', kind: 'money' },
            { key: 'returned', label: 'Returned', kind: 'money', sum: true },
            { key: 'due', label: 'Still owes', kind: 'money', sum: true },
            { key: 'last_purchase', label: 'Last purchase', kind: 'date' },
        ],
        note: 'Walk-in sales have no customer attached and are not included.',
    },
    {
        key: 'receivable-aging',
        title: 'Customer due aging',
        group: 'Customers',
        description: 'Who owes you money, and how long it has been outstanding.',
        ranged: false,
        columns: [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone', kind: 'mono' }, ...aging],
        note: 'As of today. Age is counted from the invoice date.',
    },

    // Inventory
    {
        key: 'low-stock',
        title: 'Low stock and reorder',
        group: 'Inventory',
        description: 'Products at or below their reorder level, worst first.',
        ranged: false,
        columns: [
            { key: 'name', label: 'Product' },
            { key: 'sku', label: 'SKU', kind: 'mono' },
            { key: 'category', label: 'Category' },
            { key: 'on_hand', label: 'On hand', kind: 'qty' },
            { key: 'unit', label: 'Unit' },
            { key: 'reorder_level', label: 'Reorder at', kind: 'qty' },
            { key: 'shortfall', label: 'Short by', kind: 'qty' },
            { key: 'status', label: 'Status' },
            { key: 'cost_to_refill', label: 'Cost to refill', kind: 'money', sum: true },
        ],
        note: '"Cost to refill" is what it takes to get back up to the reorder level at the current average cost.',
    },
    {
        key: 'dead-stock',
        title: 'Slow and dead stock',
        group: 'Inventory',
        description: 'Stock on the shelf and how long since each product last sold.',
        ranged: false,
        columns: [
            { key: 'name', label: 'Product' },
            { key: 'sku', label: 'SKU', kind: 'mono' },
            { key: 'category', label: 'Category' },
            { key: 'on_hand', label: 'On hand', kind: 'qty' },
            { key: 'unit', label: 'Unit' },
            { key: 'stock_value', label: 'Value at cost', kind: 'money', sum: true },
            { key: 'last_sold', label: 'Last sold', kind: 'date' },
            { key: 'days_idle', label: 'Days idle', kind: 'int' },
            { key: 'status', label: 'Status' },
        ],
        note: 'Slow = not sold for 21 days or more. Dead = 60 days or more.',
    },
    {
        key: 'stock-ledger',
        title: 'Stock movement ledger',
        group: 'Inventory',
        description: 'Opening quantity, everything that came in and went out, and the closing quantity.',
        columns: [
            { key: 'name', label: 'Product' },
            { key: 'sku', label: 'SKU', kind: 'mono' },
            { key: 'unit', label: 'Unit' },
            { key: 'opening', label: 'Opening', kind: 'qty' },
            { key: 'purchased', label: 'Purchased', kind: 'qty' },
            { key: 'returned', label: 'Cust. returns', kind: 'qty' },
            { key: 'transfer_in', label: 'Transfer in', kind: 'qty' },
            { key: 'sold', label: 'Sold', kind: 'qty' },
            { key: 'transfer_out', label: 'Transfer out', kind: 'qty' },
            { key: 'adjusted', label: 'Adjusted', kind: 'qty' },
            { key: 'closing', label: 'Closing', kind: 'qty' },
            { key: 'closing_value', label: 'Closing value', kind: 'money', sum: true },
        ],
        note: 'Closing = opening + purchased + customer returns + transfers in − sold − transfers out ± adjustments. Valued at the current weighted average cost.',
    },

    // Purchases
    {
        key: 'supplier-purchases',
        title: 'Purchases by supplier',
        group: 'Purchases',
        description: 'What you bought from each supplier, what is paid and what is still owed.',
        defaultRange: '90d',
        columns: [
            { key: 'supplier', label: 'Supplier' },
            { key: 'phone', label: 'Phone', kind: 'mono' },
            { key: 'purchases', label: 'Purchases', kind: 'int', sum: true },
            { key: 'total', label: 'Total', kind: 'money', sum: true },
            { key: 'paid', label: 'Paid', kind: 'money', sum: true },
            { key: 'due', label: 'Owed', kind: 'money', sum: true },
            { key: 'last_purchase', label: 'Last purchase', kind: 'date' },
        ],
    },
    {
        key: 'product-purchases',
        title: 'Product purchases and cost history',
        group: 'Purchases',
        description: 'Quantity bought per product and how the unit cost moved.',
        defaultRange: '90d',
        columns: [
            { key: 'name', label: 'Product' },
            { key: 'sku', label: 'SKU', kind: 'mono' },
            { key: 'purchases', label: 'Purchases', kind: 'int' },
            { key: 'quantity', label: 'Quantity', kind: 'qty', sum: true },
            { key: 'total', label: 'Total cost', kind: 'money', sum: true },
            { key: 'average_cost', label: 'Avg. cost', kind: 'money' },
            { key: 'lowest_cost', label: 'Lowest', kind: 'money' },
            { key: 'highest_cost', label: 'Highest', kind: 'money' },
            { key: 'latest_cost', label: 'Latest', kind: 'money' },
        ],
    },
    {
        key: 'payable-aging',
        title: 'Supplier due aging',
        group: 'Purchases',
        description: 'What you owe each supplier, and how old it is.',
        ranged: false,
        columns: [{ key: 'name', label: 'Supplier' }, { key: 'phone', label: 'Phone', kind: 'mono' }, ...aging],
        note: 'As of today. Age is counted from the purchase date.',
    },

    // Money
    {
        key: 'account-book',
        title: 'Cash book and bank book',
        group: 'Money',
        description: 'Every movement on one account with its opening, running and closing balance.',
        defaultRange: '7d',
        option: { param: 'account_id', label: 'Account', accounts: true },
        columns: [
            { key: 'date', label: 'Date', kind: 'datetime' },
            { key: 'description', label: 'Description' },
            { key: 'reference', label: 'Reference', kind: 'mono' },
            { key: 'type', label: 'Type' },
            { key: 'money_in', label: 'Money in', kind: 'money', sum: true },
            { key: 'money_out', label: 'Money out', kind: 'money', sum: true },
            { key: 'balance', label: 'Balance', kind: 'money' },
        ],
        note: 'Only money that really entered or left this account. Card, bank and mobile payments never count as cash in the drawer.',
    },
    {
        key: 'expenses',
        title: 'Expenses by category',
        group: 'Money',
        description: 'Running costs by category and store, including salaries and loan interest.',
        defaultRange: 'month',
        columns: [
            { key: 'category', label: 'Category' },
            { key: 'store', label: 'Store' },
            { key: 'entries', label: 'Entries', kind: 'int', sum: true },
            { key: 'amount', label: 'Amount', kind: 'money', sum: true },
            { key: 'share', label: 'Share', kind: 'percent' },
        ],
        note: 'Adds up to "Total operating expenses" on the profit and loss statement for the same period.',
    },
    {
        key: 'tax',
        title: 'Tax collected',
        group: 'Money',
        description: 'Taxable sales and tax collected at each rate, less returns.',
        defaultRange: 'month',
        columns: [
            { key: 'rate', label: 'Rate' },
            { key: 'invoices', label: 'Invoices', kind: 'int' },
            { key: 'taxable', label: 'Taxable amount', kind: 'money', sum: true },
            { key: 'tax', label: 'Tax', kind: 'money', sum: true },
        ],
        note: 'A summary of what the register charged. Confirm the figures with your accountant before filing a return.',
    },
];

export const reportGroups = ['Sales', 'Inventory', 'Purchases', 'Money', 'Customers'] as const;

export const findReport = (key: string | undefined) => reports.find((report) => report.key === key);

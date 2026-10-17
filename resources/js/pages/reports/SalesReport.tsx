import { BarList, TrendChart } from '@/components/charts';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { Card, CardHeader, Page, PageHeader, Stat, StatRow, Tabs } from '@/components/ui/Layout';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable, Stack, type Column } from '@/components/ui/Table';
import { money, moneyRound, percent, qty, titleCase } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { reportTabs, type TradingTotals } from './common';

interface Breakdown {
    name: string;
    orders: number;
    amount: number;
}

interface TopProduct {
    product_id: number;
    name: string;
    sku: string;
    quantity: number;
    revenue: number;
    profit: number;
}

interface SalesReportData {
    totals: TradingTotals;
    daily: { date: string; orders: number; sales: number; profit: number }[];
    by_category: Breakdown[];
    by_store: Breakdown[];
    by_cashier: Breakdown[];
    by_payment: Breakdown[];
    top_products: TopProduct[];
}

const paymentNames: Record<string, string> = { cash: 'Cash', card: 'Card', mobile: 'Mobile banking', bank: 'Bank transfer' };

export default function SalesReport() {
    const [range, setRange] = useRange('30d');
    const { data } = useApi<SalesReportData>('reports/sales', { from: range.from, to: range.to });

    const columns: Column<TopProduct>[] = [
        { key: 'rank', header: '#', className: 'w-10', cell: (_, index) => <span className="num text-ink-3">{index + 1}</span> },
        { key: 'name', header: 'Product', cell: (p) => <Stack primary={p.name} secondary={<span className="font-mono">{p.sku}</span>} /> },
        { key: 'qty', header: 'Units sold', align: 'right', cell: (p) => <span className="num">{qty(p.quantity)}</span> },
        { key: 'revenue', header: 'Revenue', align: 'right', cell: (p) => <span className="num font-medium">{money(p.revenue)}</span> },
        { key: 'profit', header: 'Profit', align: 'right', hide: 'sm', cell: (p) => <span className="num text-ink-2">{money(p.profit)}</span> },
        { key: 'margin', header: 'Margin', align: 'right', hide: 'md', cell: (p) => <span className="num text-ink-2">{p.revenue > 0 ? percent((p.profit / p.revenue) * 100) : '—'}</span> },
    ];

    return (
        <Page>
            <PageHeader title="Reports" description="Figures exclude tax and are net of discounts and returns." actions={<DateRange value={range} onChange={setRange} />} />
            <Tabs tabs={reportTabs} />

            {!data ? (
                <PageLoader />
            ) : (
                <>
                    <StatRow>
                        <Stat label="Net sales" value={moneyRound(data.totals.net_sales)} hint={`${data.totals.orders.toLocaleString()} sales`} />
                        <Stat label="Gross profit" value={moneyRound(data.totals.gross_profit)} hint={data.totals.net_sales > 0 ? `${percent((data.totals.gross_profit / data.totals.net_sales) * 100)} margin` : undefined} />
                        <Stat label="Average basket" value={money(data.totals.average_order)} />
                        <Stat label="Discounts given" value={moneyRound(data.totals.discounts)} hint={`${moneyRound(data.totals.returns)} returned`} />
                    </StatRow>

                    <Card className="mb-4">
                        <CardHeader title="Daily sales and profit" />
                        <div className="pr-1 pb-4">
                            <TrendChart
                                data={data.daily}
                                series={[
                                    { key: 'sales', label: 'Net sales' },
                                    { key: 'profit', label: 'Gross profit' },
                                ]}
                            />
                        </div>
                    </Card>

                    <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <Card>
                            <CardHeader title="By category" />
                            <BarList share items={data.by_category.map((row) => ({ name: row.name, amount: row.amount }))} />
                        </Card>
                        <Card>
                            <CardHeader title="By payment method" description="Money actually received" />
                            <BarList share items={data.by_payment.map((row) => ({ name: paymentNames[row.name] ?? titleCase(row.name), amount: row.amount }))} />
                        </Card>
                        <Card className="md:col-span-2 xl:col-span-1">
                            <CardHeader title={data.by_store.length > 1 ? 'By store' : 'By cashier'} />
                            <BarList
                                share
                                items={(data.by_store.length > 1 ? data.by_store : data.by_cashier).map((row) => ({ name: row.name, amount: row.amount, detail: `${row.orders} sales` }))}
                            />
                        </Card>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                        <Card className="xl:col-span-2">
                            <CardHeader title="Top products" description="Ranked by revenue" />
                            <DataTable dense columns={columns} rows={data.top_products} rowKey={(p) => p.product_id} />
                        </Card>
                        {data.by_store.length > 1 && (
                            <Card>
                                <CardHeader title="By cashier" />
                                <BarList items={data.by_cashier.slice(0, 8).map((row) => ({ name: row.name, amount: row.amount, detail: `${row.orders} sales` }))} />
                            </Card>
                        )}
                    </div>
                </>
            )}
        </Page>
    );
}

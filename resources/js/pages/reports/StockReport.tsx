import { Card, CardHeader, Page, PageHeader, Stat, StatRow, Tabs } from '@/components/ui/Layout';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable, type Column } from '@/components/ui/Table';
import { money, moneyRound, percent, qty } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useCurrentStore } from '@/lib/session';
import { reportTabs } from './common';

interface Row {
    name: string;
    products: number;
    units: number;
    cost_value: number;
    retail_value: number;
}

interface StockReportData {
    by_category: Row[];
    totals: Omit<Row, 'name'>;
}

export default function StockReport() {
    const store = useCurrentStore();
    const { data } = useApi<StockReportData>('reports/stock');

    const columns: Column<Row>[] = [
        { key: 'name', header: 'Category', cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'products', header: 'Products', align: 'right', hide: 'sm', cell: (r) => <span className="num text-ink-2">{r.products}</span> },
        { key: 'units', header: 'Units', align: 'right', hide: 'sm', cell: (r) => <span className="num text-ink-2">{qty(r.units)}</span> },
        { key: 'cost', header: 'Value at cost', align: 'right', cell: (r) => <span className="num font-medium">{money(r.cost_value)}</span> },
        { key: 'retail', header: 'At selling price', align: 'right', cell: (r) => <span className="num">{money(r.retail_value)}</span> },
        { key: 'profit', header: 'Potential profit', align: 'right', hide: 'md', cell: (r) => <span className="num text-ink-2">{money(r.retail_value - r.cost_value)}</span> },
        {
            key: 'share',
            header: 'Share of stock',
            align: 'right',
            hide: 'lg',
            cell: (r) => <span className="num text-ink-2">{data && data.totals.cost_value > 0 ? percent((r.cost_value / data.totals.cost_value) * 100) : '—'}</span>,
        },
    ];

    return (
        <Page>
            <PageHeader title="Reports" description={`What the stock ${store ? `at ${store.name}` : 'across all stores'} is worth right now.`} />
            <Tabs tabs={reportTabs} />

            {!data ? (
                <PageLoader />
            ) : (
                <>
                    <StatRow>
                        <Stat label="Value at cost" value={moneyRound(data.totals.cost_value)} />
                        <Stat label="Value at selling price" value={moneyRound(data.totals.retail_value)} />
                        <Stat label="Potential profit" value={moneyRound(data.totals.retail_value - data.totals.cost_value)} tone="good" />
                        <Stat label="Units on hand" value={qty(data.totals.units)} hint={`${data.totals.products} products`} />
                    </StatRow>

                    <Card>
                        <CardHeader title="By category" />
                        <DataTable
                            columns={columns}
                            rows={data.by_category}
                            rowKey={(r) => r.name}
                            footer={
                                <tr className="border-t border-line-strong bg-canvas/60 font-semibold">
                                    <td className="h-11 pl-5">Total</td>
                                    <td className="num hidden px-4 text-right sm:table-cell">{data.totals.products}</td>
                                    <td className="num hidden px-4 text-right sm:table-cell">{qty(data.totals.units)}</td>
                                    <td className="num px-4 text-right">{money(data.totals.cost_value)}</td>
                                    <td className="num px-4 text-right">{money(data.totals.retail_value)}</td>
                                    <td className="num hidden px-4 text-right md:table-cell">{money(data.totals.retail_value - data.totals.cost_value)}</td>
                                    <td className="hidden pr-5 lg:table-cell" />
                                </tr>
                            }
                        />
                    </Card>
                </>
            )}
        </Page>
    );
}

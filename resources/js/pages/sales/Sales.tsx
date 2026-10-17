import { Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, PaymentBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Toolbar } from '@/components/ui/Layout';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { formatDateTime, money, moneyRound } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Sale, TotalsSummary, WithSummary } from '@/lib/types';

export default function Sales() {
    const navigate = useNavigate();
    const can = useCan();
    const allStores = useSession((s) => s.storeId === null);
    const [range, setRange] = useRange('30d');
    const [search, setSearch] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');
    const term = useDebounced(search);

    const { data, isLoading, setPage } = usePaged<Sale, WithSummary<Sale, TotalsSummary>>('sales', {
        search: term,
        payment_status: paymentStatus,
        from: range.from,
        to: range.to,
    });

    const columns: Column<Sale>[] = [
        { key: 'invoice', header: 'Invoice', cell: (sale) => <Stack mono primary={sale.invoice_no} secondary={formatDateTime(sale.sold_at)} /> },
        { key: 'customer', header: 'Customer', cell: (sale) => (sale.customer ? <Stack primary={sale.customer.name} secondary={sale.customer.phone} /> : <span className="text-ink-3">Walk-in</span>) },
        ...(allStores ? [{ key: 'store', header: 'Store', hide: 'md', cell: (sale: Sale) => <span className="text-ink-2">{sale.store?.name}</span> } satisfies Column<Sale>] : []),
        { key: 'cashier', header: 'Sold by', hide: 'lg', cell: (sale) => <span className="text-ink-2">{sale.user?.name ?? '—'}</span> },
        { key: 'items', header: 'Items', align: 'right', hide: 'md', cell: (sale) => <span className="num text-ink-2">{sale.items_count}</span> },
        { key: 'total', header: 'Total', align: 'right', cell: (sale) => <span className="num font-medium">{money(sale.total)}</span> },
        {
            key: 'due',
            header: 'Due',
            align: 'right',
            hide: 'sm',
            cell: (sale) => (sale.due_amount > 0 ? <span className="num text-bad">{money(sale.due_amount)}</span> : <span className="text-ink-3">—</span>),
        },
        {
            key: 'status',
            header: 'Status',
            cell: (sale) => (
                <div className="flex gap-1.5">
                    <PaymentBadge status={sale.payment_status} />
                    {sale.status !== 'completed' && <Badge tone="info">{sale.status === 'returned' ? 'Returned' : 'Part returned'}</Badge>}
                </div>
            ),
        },
    ];

    return (
        <Page>
            <PageHeader
                title="Sales"
                description="Every invoice rung up at the register."
                actions={
                    can('pos.access') && (
                        <Link to="/pos" tabIndex={-1}>
                            <Button variant="primary" icon={<Plus />}>
                                New sale
                            </Button>
                        </Link>
                    )
                }
            />

            <StatRow>
                <Stat label="Invoices" value={(data?.summary.count ?? 0).toLocaleString()} />
                <Stat label="Sales value" value={moneyRound(data?.summary.total)} />
                <Stat label="Collected" value={moneyRound(data?.summary.paid)} />
                <Stat label="Outstanding" value={moneyRound(data?.summary.due)} tone={data?.summary.due ? 'bad' : 'default'} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Invoice no. or customer" />
                    <Select aria-label="Payment status" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="w-40">
                        <option value="">Any payment</option>
                        <option value="paid">Paid</option>
                        <option value="partial">Partly paid</option>
                        <option value="due">Unpaid</option>
                    </Select>
                    <div className="sm:ml-auto">
                        <DateRange value={range} onChange={setRange} />
                    </div>
                </Toolbar>
                <DataTable
                    columns={columns}
                    rows={data?.data}
                    loading={isLoading}
                    onRowClick={(sale) => navigate(`/sales/${sale.id}`)}
                    empty={<Empty icon={<ReceiptText />} title="No sales match" hint="Try a wider date range or clear the filters." />}
                />
                <Pager meta={data} onPage={setPage} />
            </Card>
        </Page>
    );
}

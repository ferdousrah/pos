import { Plus, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StoreNotice, useHasStore } from '@/components/shared';
import { PaymentBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Toolbar } from '@/components/ui/Layout';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { formatDate, money, moneyRound } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Purchase, TotalsSummary, WithSummary } from '@/lib/types';

export default function Purchases() {
    const navigate = useNavigate();
    const can = useCan();
    const hasStore = useHasStore();
    const allStores = useSession((s) => s.storeId === null);
    const [range, setRange] = useRange('90d');
    const [search, setSearch] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');
    const term = useDebounced(search);

    const { data, isLoading, setPage } = usePaged<Purchase, WithSummary<Purchase, TotalsSummary>>('purchases', {
        search: term,
        payment_status: paymentStatus,
        from: range.from,
        to: range.to,
    });

    const columns: Column<Purchase>[] = [
        { key: 'ref', header: 'Reference', cell: (p) => <Stack mono primary={p.reference_no} secondary={formatDate(p.purchased_at)} /> },
        { key: 'supplier', header: 'Supplier', cell: (p) => <Stack primary={p.supplier?.name} secondary={p.supplier_invoice_no && `Inv. ${p.supplier_invoice_no}`} /> },
        ...(allStores ? [{ key: 'store', header: 'Store', hide: 'md', cell: (p: Purchase) => <span className="text-ink-2">{p.store?.name}</span> } satisfies Column<Purchase>] : []),
        { key: 'items', header: 'Items', align: 'right', hide: 'md', cell: (p) => <span className="num text-ink-2">{p.items_count}</span> },
        { key: 'total', header: 'Total', align: 'right', cell: (p) => <span className="num font-medium">{money(p.total)}</span> },
        { key: 'due', header: 'Owed', align: 'right', hide: 'sm', cell: (p) => (p.due_amount > 0 ? <span className="num text-bad">{money(p.due_amount)}</span> : <span className="text-ink-3">—</span>) },
        { key: 'status', header: 'Status', cell: (p) => <PaymentBadge status={p.payment_status} /> },
    ];

    return (
        <Page>
            <PageHeader
                title="Purchases"
                description="Stock received from suppliers."
                actions={
                    can('purchases.manage') && (
                        <Link to="/purchases/new" className={hasStore ? undefined : 'pointer-events-none'} tabIndex={hasStore ? undefined : -1}>
                            <Button variant="primary" icon={<Plus />} disabled={!hasStore}>
                                New purchase
                            </Button>
                        </Link>
                    )
                }
            />

            {can('purchases.manage') && <StoreNotice action="record a purchase" />}

            <StatRow>
                <Stat label="Purchases" value={(data?.summary.count ?? 0).toLocaleString()} />
                <Stat label="Purchase value" value={moneyRound(data?.summary.total)} />
                <Stat label="Paid" value={moneyRound(data?.summary.paid)} />
                <Stat label="Owed to suppliers" value={moneyRound(data?.summary.due)} tone={data?.summary.due ? 'bad' : 'default'} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Reference or supplier" />
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
                    onRowClick={(p) => navigate(`/purchases/${p.id}`)}
                    empty={<Empty icon={<Truck />} title="No purchases match" hint="Try a wider date range or clear the filters." />}
                />
                <Pager meta={data} onPage={setPage} />
            </Card>
        </Page>
    );
}

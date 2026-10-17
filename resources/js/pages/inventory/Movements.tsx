import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Tabs, Toolbar } from '@/components/ui/Layout';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { formatDateTime, qty } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Named, StoreRef, WithSummary } from '@/lib/types';
import { inventoryTabs } from './common';

interface Movement {
    id: number;
    type: string;
    quantity: number;
    balance_after: number;
    note: string | null;
    moved_at: string;
    product: { id: number; name: string; sku: string };
    store: StoreRef;
    user: Named | null;
}

const types: Record<string, { label: string; tone: Tone }> = {
    purchase: { label: 'Purchase', tone: 'info' },
    sale: { label: 'Sale', tone: 'neutral' },
    sale_return: { label: 'Customer return', tone: 'warn' },
    adjustment: { label: 'Adjustment', tone: 'brand' },
    transfer_in: { label: 'Transfer in', tone: 'good' },
    transfer_out: { label: 'Transfer out', tone: 'bad' },
};

export default function Movements() {
    const allStores = useSession((s) => s.storeId === null);
    const [range, setRange] = useRange('7d');
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const term = useDebounced(search);

    const { data, isLoading, setPage } = usePaged<Movement, WithSummary<Movement, { count: number; products: number; units_in: number; units_out: number }>>(
        'inventory/movements',
        { search: term, type, from: range.from, to: range.to },
        25,
    );

    const columns: Column<Movement>[] = [
        { key: 'when', header: 'When', cell: (m) => <span className="num whitespace-nowrap text-ink-2">{formatDateTime(m.moved_at)}</span> },
        { key: 'product', header: 'Product', cell: (m) => <Stack primary={m.product.name} secondary={<span className="font-mono">{m.product.sku}</span>} /> },
        { key: 'type', header: 'Reason', cell: (m) => <Badge tone={types[m.type]?.tone}>{types[m.type]?.label ?? m.type}</Badge> },
        ...(allStores ? [{ key: 'store', header: 'Store', hide: 'md', cell: (m: Movement) => <span className="text-ink-2">{m.store.name}</span> } satisfies Column<Movement>] : []),
        {
            key: 'qty',
            header: 'Change',
            align: 'right',
            cell: (m) => (
                <span className={cn('num font-medium', m.quantity > 0 ? 'text-good' : 'text-bad')}>
                    {m.quantity > 0 ? '+' : '−'}
                    {qty(Math.abs(m.quantity))}
                </span>
            ),
        },
        { key: 'balance', header: 'Balance', align: 'right', cell: (m) => <span className="num">{qty(m.balance_after)}</span> },
        { key: 'by', header: 'By', hide: 'lg', cell: (m) => <span className="text-ink-2">{m.user?.name ?? '—'}</span> },
    ];

    return (
        <Page>
            <PageHeader title="Inventory" description="Every unit that entered or left a store, and why." />
            <Tabs tabs={inventoryTabs} />

            <StatRow>
                <Stat label="Movements" value={(data?.summary.count ?? 0).toLocaleString()} />
                <Stat label="Units in" value={`+${qty(data?.summary.units_in)}`} tone="good" />
                <Stat label="Units out" value={`−${qty(data?.summary.units_out)}`} />
                <Stat label="Products affected" value={data?.summary.products ?? 0} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Product name or SKU" />
                    <Select aria-label="Reason" value={type} onChange={(e) => setType(e.target.value)} className="w-44">
                        <option value="">Any reason</option>
                        {Object.entries(types).map(([key, value]) => (
                            <option key={key} value={key}>
                                {value.label}
                            </option>
                        ))}
                    </Select>
                    <div className="sm:ml-auto">
                        <DateRange value={range} onChange={setRange} />
                    </div>
                </Toolbar>
                <DataTable dense columns={columns} rows={data?.data} loading={isLoading} empty={<Empty icon={<ArrowLeftRight />} title="No stock movements in this period" />} />
                <Pager meta={data} onPage={setPage} />
            </Card>
        </Page>
    );
}

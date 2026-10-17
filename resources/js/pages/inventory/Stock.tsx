import { Boxes } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Tabs, Toolbar } from '@/components/ui/Layout';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { money, moneyRound, qty } from '@/lib/format';
import { useApi, useDebounced, usePaged } from '@/lib/hooks';
import { useCurrentStore } from '@/lib/session';
import type { Named, Product, WithSummary } from '@/lib/types';
import { inventoryTabs } from './common';

interface Summary {
    products: number;
    units: number;
    cost_value: number;
    retail_value: number;
    out_of_stock: number;
    low_stock: number;
}

export default function Stock() {
    const store = useCurrentStore();
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [status, setStatus] = useState('');
    const term = useDebounced(search);

    const { data: options } = useApi<{ categories: Named[] }>('products/options');
    const { data, isLoading, setPage } = usePaged<Product, WithSummary<Product, Summary>>('inventory/stock', { search: term, category_id: categoryId, status }, 20);

    const columns: Column<Product>[] = [
        { key: 'name', header: 'Product', cell: (p) => <Stack primary={p.name} secondary={<span className="font-mono">{p.sku}</span>} /> },
        { key: 'category', header: 'Category', hide: 'md', cell: (p) => <span className="text-ink-2">{p.category?.name ?? '—'}</span> },
        {
            key: 'stock',
            header: 'On hand',
            align: 'right',
            cell: (p) => (
                <span className="num font-medium">
                    {qty(p.stock)} <span className="font-normal text-ink-3">{p.unit?.short_name}</span>
                </span>
            ),
        },
        { key: 'reorder', header: 'Reorder at', align: 'right', hide: 'sm', cell: (p) => <span className="num text-ink-2">{qty(p.reorder_level)}</span> },
        { key: 'value', header: 'Value at cost', align: 'right', hide: 'sm', cell: (p) => <span className="num text-ink-2">{money((p.stock ?? 0) * p.cost_price)}</span> },
        {
            key: 'status',
            header: 'Status',
            cell: (p) => {
                const stock = p.stock ?? 0;
                if (stock <= 0) return <Badge tone="bad">Out of stock</Badge>;
                if (stock <= p.reorder_level) return <Badge tone="warn">Low</Badge>;
                return <Badge tone="good">In stock</Badge>;
            },
        },
    ];

    return (
        <Page>
            <PageHeader title="Inventory" description={store ? `What is on the shelves at ${store.name}.` : 'Combined stock across all of your stores.'} />
            <Tabs tabs={inventoryTabs} />

            <StatRow>
                <Stat label="Stock value at cost" value={moneyRound(data?.summary.cost_value)} />
                <Stat label="Value at selling price" value={moneyRound(data?.summary.retail_value)} />
                <Stat label="Running low" value={data?.summary.low_stock ?? 0} tone={data?.summary.low_stock ? 'warn' : 'default'} hint="At or below reorder level" />
                <Stat label="Out of stock" value={data?.summary.out_of_stock ?? 0} tone={data?.summary.out_of_stock ? 'bad' : 'default'} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name, SKU or barcode" />
                    <Select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-44">
                        <option value="">All categories</option>
                        {options?.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </Select>
                    <Select aria-label="Stock status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
                        <option value="">Any level</option>
                        <option value="in">In stock</option>
                        <option value="low">Running low</option>
                        <option value="out">Out of stock</option>
                    </Select>
                </Toolbar>
                <DataTable columns={columns} rows={data?.data} loading={isLoading} empty={<Empty icon={<Boxes />} title="No products match" />} />
                <Pager meta={data} onPage={setPage} />
            </Card>
        </Page>
    );
}

import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { StoreNotice, useHasStore } from '@/components/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Tabs } from '@/components/ui/Layout';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, qty, titleCase } from '@/lib/format';
import { useAction, usePaged } from '@/lib/hooks';
import { useCan, useCurrentStore, useSession } from '@/lib/session';
import type { Named, StoreRef } from '@/lib/types';
import { inventoryTabs, ItemRows, type ItemRow } from './common';

interface Adjustment {
    id: number;
    reference_no: string;
    reason: string;
    note: string | null;
    adjusted_at: string;
    store: StoreRef;
    user: Named | null;
    items: { id: number; quantity: number; product: { name: string; sku: string } }[];
}

// Reasons that can only ever take stock away.
const reasons: Record<string, { label: string; removes: boolean | null }> = {
    damage: { label: 'Damaged', removes: true },
    expired: { label: 'Expired', removes: true },
    loss: { label: 'Lost or stolen', removes: true },
    found: { label: 'Found', removes: false },
    correction: { label: 'Stock count correction', removes: null },
};

function AdjustmentForm({ open, onClose }: { open: boolean; onClose: () => void }) {
    const store = useCurrentStore();
    const [reason, setReason] = useState('damage');
    const [note, setNote] = useState('');
    const [rows, setRows] = useState<ItemRow[]>([]);
    const removes = reasons[reason].removes;

    const signed = (row: ItemRow) => {
        const value = parseFloat(row.quantity) || 0;
        if (removes === true) return -Math.abs(value);
        if (removes === false) return Math.abs(value);
        return value;
    };

    const save = useAction(
        () => api.post('inventory/adjustments', { reason, note: note || null, items: rows.map((row) => ({ product_id: row.product.id, quantity: signed(row) })).filter((i) => i.quantity !== 0) }),
        {
            success: 'Stock adjusted',
            onSuccess: () => {
                setRows([]);
                setNote('');
                onClose();
            },
        },
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Adjust stock"
            icon={<ClipboardList />}
            bodyClassName="min-h-[430px]"
            description={`Correcting stock at ${store?.name}`}
            size="lg"
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel="Apply adjustment" disabled={rows.every((row) => signed(row) === 0)} />}
        >
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {Object.entries(reasons).map(([key, value]) => (
                        <option key={key} value={key}>
                            {value.label}
                        </option>
                    ))}
                </Select>
                <Input label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <ItemRows
                rows={rows}
                onChange={setRows}
                allowNegative={removes === null}
                quantityLabel={removes === true ? 'Remove' : removes === false ? 'Add' : 'Change (±)'}
                result={{
                    label: 'New balance',
                    render: (row) => {
                        const next = (row.product.stock ?? 0) + signed(row);
                        return <span className={cn('font-medium', next < 0 && 'text-bad')}>{qty(next)}</span>;
                    },
                }}
            />
            {removes === null && rows.length > 0 && <p className="mt-2 text-xs text-ink-3">Use a negative number to take stock away.</p>}
        </Modal>
    );
}

export default function Adjustments() {
    const can = useCan();
    const hasStore = useHasStore();
    const allStores = useSession((s) => s.storeId === null);
    const [open, setOpen] = useState(false);
    const { data, isLoading, setPage } = usePaged<Adjustment>('inventory/adjustments');

    const columns: Column<Adjustment>[] = [
        { key: 'ref', header: 'Reference', cell: (a) => <Stack mono primary={a.reference_no} secondary={formatDateTime(a.adjusted_at)} /> },
        { key: 'reason', header: 'Reason', cell: (a) => <Badge>{reasons[a.reason]?.label ?? titleCase(a.reason)}</Badge> },
        ...(allStores ? [{ key: 'store', header: 'Store', hide: 'md', cell: (a: Adjustment) => <span className="text-ink-2">{a.store.name}</span> } satisfies Column<Adjustment>] : []),
        {
            key: 'items',
            header: 'Items',
            cell: (a) => (
                <div className="max-w-md truncate text-ink-2">
                    {a.items.map((item, index) => (
                        <span key={item.id}>
                            {index > 0 && ', '}
                            {item.product.name}{' '}
                            <span className={cn('num font-medium', item.quantity > 0 ? 'text-good' : 'text-bad')}>
                                {item.quantity > 0 ? '+' : '−'}
                                {qty(Math.abs(item.quantity))}
                            </span>
                        </span>
                    ))}
                </div>
            ),
        },
        { key: 'by', header: 'By', hide: 'lg', cell: (a) => <Stack primary={<span className="font-normal text-ink-2">{a.user?.name ?? '—'}</span>} secondary={a.note} /> },
    ];

    return (
        <Page>
            <PageHeader
                title="Inventory"
                description="Write-offs, stock counts and other corrections."
                actions={
                    can('inventory.adjust') && (
                        <Button variant="primary" icon={<Plus />} disabled={!hasStore} onClick={() => setOpen(true)}>
                            Adjust stock
                        </Button>
                    )
                }
            />
            <Tabs tabs={inventoryTabs} />
            {can('inventory.adjust') && <StoreNotice action="adjust its stock" />}

            <Card>
                <DataTable columns={columns} rows={data?.data} loading={isLoading} empty={<Empty icon={<ClipboardList />} title="No adjustments yet" hint="Use an adjustment when the shelf does not match the system." />} />
                <Pager meta={data} onPage={setPage} />
            </Card>

            {hasStore && <AdjustmentForm open={open} onClose={() => setOpen(false)} />}
        </Page>
    );
}

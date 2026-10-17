import { ArrowRight, Plus, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { StoreNotice, useHasStore } from '@/components/shared';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Tabs } from '@/components/ui/Layout';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, qty } from '@/lib/format';
import { useAction, usePaged } from '@/lib/hooks';
import { useCan, useCurrentStore, useSession } from '@/lib/session';
import type { Named, StoreRef } from '@/lib/types';
import { inventoryTabs, ItemRows, type ItemRow } from './common';

interface Transfer {
    id: number;
    reference_no: string;
    note: string | null;
    transferred_at: string;
    from_store: StoreRef;
    to_store: StoreRef;
    user: Named | null;
    items: { id: number; quantity: number; product: { name: string } }[];
}

function TransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
    const store = useCurrentStore();
    const stores = useSession((s) => s.profile!.stores);
    const [toStoreId, setToStoreId] = useState('');
    const [note, setNote] = useState('');
    const [rows, setRows] = useState<ItemRow[]>([]);
    const [error, setError] = useState('');

    const save = useAction(
        () =>
            api.post('inventory/transfers', {
                to_store_id: toStoreId,
                note: note || null,
                items: rows.map((row) => ({ product_id: row.product.id, quantity: parseFloat(row.quantity) || 0 })).filter((i) => i.quantity > 0),
            }),
        {
            success: 'Stock transferred',
            onInvalid: (errors) => setError(errors.to_store_id ?? Object.values(errors)[0]),
            onSuccess: () => {
                setRows([]);
                setNote('');
                setToStoreId('');
                onClose();
            },
        },
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Transfer stock"
            icon={<Shuffle />}
            bodyClassName="min-h-[430px]"
            description={`Sending from ${store?.name}. Stock moves immediately.`}
            size="lg"
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel="Transfer" disabled={!toStoreId || rows.every((row) => !(parseFloat(row.quantity) > 0))} />}
        >
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <Select
                    label="Send to"
                    required
                    value={toStoreId}
                    error={error || undefined}
                    onChange={(e) => {
                        setToStoreId(e.target.value);
                        setError('');
                    }}
                >
                    <option value="">Choose a store</option>
                    {stores
                        .filter((s) => s.id !== store?.id)
                        .map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                </Select>
                <Input label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <ItemRows
                rows={rows}
                onChange={setRows}
                quantityLabel="Send"
                result={{
                    label: 'Left here',
                    render: (row) => {
                        const left = (row.product.stock ?? 0) - (parseFloat(row.quantity) || 0);
                        return <span className={cn('font-medium', left < 0 && 'text-bad')}>{qty(left)}</span>;
                    },
                }}
            />
        </Modal>
    );
}

export default function Transfers() {
    const can = useCan();
    const hasStore = useHasStore();
    const storeCount = useSession((s) => s.profile!.stores.length);
    const [open, setOpen] = useState(false);
    const { data, isLoading, setPage } = usePaged<Transfer>('inventory/transfers');

    const columns: Column<Transfer>[] = [
        { key: 'ref', header: 'Reference', cell: (t) => <Stack mono primary={t.reference_no} secondary={formatDateTime(t.transferred_at)} /> },
        {
            key: 'route',
            header: 'Route',
            cell: (t) => (
                <span className="flex items-center gap-2 whitespace-nowrap">
                    {t.from_store.name}
                    <ArrowRight className="size-3.5 text-ink-3" />
                    <span className="font-medium">{t.to_store.name}</span>
                </span>
            ),
        },
        {
            key: 'items',
            header: 'Items',
            cell: (t) => <div className="max-w-md truncate text-ink-2">{t.items.map((item) => `${item.product.name} × ${qty(item.quantity)}`).join(', ')}</div>,
        },
        { key: 'by', header: 'By', hide: 'lg', cell: (t) => <Stack primary={<span className="font-normal text-ink-2">{t.user?.name ?? '—'}</span>} secondary={t.note} /> },
    ];

    return (
        <Page>
            <PageHeader
                title="Inventory"
                description="Stock moved from one store to another."
                actions={
                    can('inventory.transfer') &&
                    storeCount > 1 && (
                        <Button variant="primary" icon={<Plus />} disabled={!hasStore} onClick={() => setOpen(true)}>
                            Transfer stock
                        </Button>
                    )
                }
            />
            <Tabs tabs={inventoryTabs} />
            {can('inventory.transfer') && storeCount > 1 && <StoreNotice action="send stock from it" />}

            <Card>
                <DataTable columns={columns} rows={data?.data} loading={isLoading} empty={<Empty icon={<Shuffle />} title="No transfers yet" hint="Move surplus stock to a store that is running low." />} />
                <Pager meta={data} onPage={setPage} />
            </Card>

            {hasStore && <TransferForm open={open} onClose={() => setOpen(false)} />}
        </Page>
    );
}

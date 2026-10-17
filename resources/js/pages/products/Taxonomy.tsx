import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { ActiveBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Switch } from '@/components/ui/Field';
import { Card, Page, PageHeader, Tabs } from '@/components/ui/Layout';
import { MenuItem, RowMenu } from '@/components/ui/Menu';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { useAction, useApi, useDisclosure, useForm } from '@/lib/hooks';
import { useCan } from '@/lib/session';
import { productTabs } from './Products';

type Kind = 'categories' | 'brands' | 'units';

interface Entry {
    id: number;
    name: string;
    short_name?: string;
    allow_decimal?: boolean;
    is_active: boolean;
    products_count: number;
}

const copy: Record<Kind, { singular: string; description: string }> = {
    categories: { singular: 'category', description: 'Group products the way your shelves are organised.' },
    brands: { singular: 'brand', description: 'The manufacturers and labels you carry.' },
    units: { singular: 'unit', description: 'How products are counted and sold.' },
};

const blank = { name: '', short_name: '', allow_decimal: false, is_active: true };

export default function Taxonomy({ type }: { type: Kind }) {
    const can = useCan();
    const manage = can('products.manage');
    const { singular, description } = copy[type];
    const { data, isLoading } = useApi<Entry[]>(`catalog/${type}`);
    const editor = useDisclosure<Entry | true>();
    const removal = useDisclosure<Entry>();
    const editing = typeof editor.state === 'object' ? editor.state : null;
    const form = useForm(blank);

    useEffect(() => {
        if (editor.state) form.reset(editing ? { name: editing.name, short_name: editing.short_name ?? '', allow_decimal: !!editing.allow_decimal, is_active: editing.is_active } : blank);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state]);

    const save = useAction(() => (editing ? api.put(`catalog/${type}/${editing.id}`, form.values) : api.post(`catalog/${type}`, form.values)), {
        success: `${singular[0].toUpperCase()}${singular.slice(1)} saved`,
        onInvalid: form.invalid,
        onSuccess: editor.close,
    });

    const remove = useAction((id: number) => api.delete(`catalog/${type}/${id}`), { success: `${singular[0].toUpperCase()}${singular.slice(1)} deleted`, onSuccess: removal.close });

    const columns: Column<Entry>[] = [
        { key: 'name', header: 'Name', cell: (e) => <span className="font-medium">{e.name}</span> },
        ...(type === 'units'
            ? ([
                  { key: 'short', header: 'Abbreviation', cell: (e) => <span className="font-mono text-[12.5px] text-ink-2">{e.short_name}</span> },
                  { key: 'decimal', header: 'Fractions', hide: 'sm', cell: (e) => <span className="text-ink-2">{e.allow_decimal ? 'Allowed (e.g. 1.5)' : 'Whole numbers only'}</span> },
              ] satisfies Column<Entry>[])
            : []),
        { key: 'count', header: 'Products', align: 'right', cell: (e) => <span className="num text-ink-2">{e.products_count}</span> },
        { key: 'status', header: 'Status', cell: (e) => <ActiveBadge active={e.is_active} /> },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-12',
                      cell: (e: Entry) => (
                          <RowMenu>
                              <MenuItem icon={<Pencil />} onSelect={() => editor.open(e)}>
                                  Edit
                              </MenuItem>
                              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => removal.open(e)}>
                                  Delete
                              </MenuItem>
                          </RowMenu>
                      ),
                  } satisfies Column<Entry>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader
                title="Products"
                description={description}
                actions={
                    manage && (
                        <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                            New {singular}
                        </Button>
                    )
                }
            />
            <Tabs tabs={productTabs} />

            <Card className="max-w-3xl">
                <DataTable columns={columns} rows={data} loading={isLoading} empty={<Empty title={`No ${type} yet`} />} />
            </Card>

            <Modal
                open={editor.isOpen}
                onClose={editor.close}
                title={editing ? `Edit ${singular}` : `New ${singular}`}
                size="sm"
                onSubmit={() => save.mutate()}
                footer={<FormFooter onCancel={editor.close} loading={save.isPending} />}
            >
                <div className="space-y-4">
                    <Input label="Name" required {...form.bind('name')} />
                    {type === 'units' && (
                        <>
                            <Input label="Abbreviation" required placeholder="e.g. kg" {...form.bind('short_name')} />
                            <Switch
                                checked={form.values.allow_decimal}
                                onChange={(v) => form.set('allow_decimal', v)}
                                label="Allow fractions"
                                description="For goods sold by weight or volume, such as 0.5 kg."
                            />
                        </>
                    )}
                    {editing && <Switch checked={form.values.is_active} onChange={(v) => form.set('is_active', v)} label="Active" />}
                </div>
            </Modal>

            <Confirm
                open={removal.isOpen}
                onClose={removal.close}
                onConfirm={() => removal.state && remove.mutate(removal.state.id)}
                loading={remove.isPending}
                title={`Delete ${singular}?`}
                message={
                    <>
                        <strong className="font-medium text-ink">{removal.state?.name}</strong> will be removed. This only works when no products use it.
                    </>
                }
            />
        </Page>
    );
}

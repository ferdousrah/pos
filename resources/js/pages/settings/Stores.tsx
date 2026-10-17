import { Pencil, Plus } from 'lucide-react';
import { useEffect } from 'react';
import { ActiveBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Switch } from '@/components/ui/Field';
import { Card, Page, PageHeader } from '@/components/ui/Layout';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { useAction, useApi, useDisclosure, useForm } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { SettingsTabs } from './common';

interface Store {
    id: number;
    name: string;
    code: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    is_active: boolean;
    users_count: number;
}

const blank = { name: '', code: '', phone: '', email: '', address: '', city: '', is_active: true };

export default function Stores() {
    const setProfile = useSession((s) => s.setProfile);
    const { data, isLoading } = useApi<Store[]>('stores');
    const editor = useDisclosure<Store | true>();
    const editing = typeof editor.state === 'object' ? editor.state : null;
    const form = useForm(blank);

    useEffect(() => {
        if (!editor.state) return;
        form.reset(
            editing
                ? { name: editing.name, code: editing.code, phone: editing.phone ?? '', email: editing.email ?? '', address: editing.address ?? '', city: editing.city ?? '', is_active: editing.is_active }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state]);

    const save = useAction(() => (editing ? api.put(`stores/${editing.id}`, form.values) : api.post('stores', form.values)), {
        success: editing ? 'Store updated' : 'Store created with its own cash drawer',
        onInvalid: form.invalid,
        onSuccess: async () => {
            editor.close();
            // The store switcher reads from the profile, so refresh it.
            setProfile((await api.get<Profile>('me')).data);
        },
    });

    const columns: Column<Store>[] = [
        { key: 'name', header: 'Store', cell: (s) => <Stack primary={s.name} secondary={[s.address, s.city].filter(Boolean).join(', ')} /> },
        { key: 'code', header: 'Code', cell: (s) => <span className="font-mono text-[12.5px] text-ink-2">{s.code}</span> },
        { key: 'phone', header: 'Phone', hide: 'md', cell: (s) => <span className="num text-ink-2">{s.phone ?? '—'}</span> },
        { key: 'users', header: 'Assigned users', align: 'right', hide: 'sm', cell: (s) => <span className="num text-ink-2">{s.users_count}</span> },
        { key: 'status', header: 'Status', cell: (s) => <ActiveBadge active={s.is_active} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            className: 'w-12',
            cell: (s) => (
                <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => editor.open(s)}>
                    <Pencil />
                </Button>
            ),
        },
    ];

    return (
        <Page>
            <PageHeader
                title="Settings"
                description="Each store keeps its own stock, cash drawer and document numbers."
                actions={
                    <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                        New store
                    </Button>
                }
            />
            <SettingsTabs />

            <Card>
                <DataTable columns={columns} rows={data} loading={isLoading} />
            </Card>

            <Modal open={editor.isOpen} onClose={editor.close} title={editing ? 'Edit store' : 'New store'} onSubmit={() => save.mutate()} footer={<FormFooter onCancel={editor.close} loading={save.isPending} />}>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Input wrapperClassName="sm:col-span-2" label="Store name" required {...form.bind('name')} />
                    <Input
                        label="Code"
                        required
                        maxLength={6}
                        className="font-mono uppercase"
                        hint="Used in invoice numbers."
                        {...form.bind('code')}
                        onChange={(e) => form.set('code', e.target.value.toUpperCase())}
                    />
                    <Input wrapperClassName="sm:col-span-2" label="Address" optional {...form.bind('address')} />
                    <Input label="City" optional {...form.bind('city')} />
                    <Input wrapperClassName="sm:col-span-2" label="Email" optional type="email" {...form.bind('email')} />
                    <Input label="Phone" optional {...form.bind('phone')} />
                    {editing && (
                        <div className="sm:col-span-3">
                            <Switch checked={form.values.is_active} onChange={(v) => form.set('is_active', v)} label="Open for business" description="Closed stores disappear from the store switcher but keep their history." />
                        </div>
                    )}
                </div>
            </Modal>
        </Page>
    );
}

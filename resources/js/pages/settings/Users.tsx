import { Plus, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActiveBadge, Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, SearchInput, Select, Switch } from '@/components/ui/Field';
import { Card, Page, PageHeader, Toolbar } from '@/components/ui/Layout';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDateTime, initials } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Named, StoreRef } from '@/lib/types';
import { SettingsTabs } from './common';

interface User {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role_id: number;
    is_active: boolean;
    last_login_at: string | null;
    role: Named;
    stores: StoreRef[];
}

interface RoleOption extends Named {
    permissions: string[];
}

const blank = { name: '', email: '', phone: '', password: '', role_id: '', store_ids: [] as number[], is_active: true };

function UserForm({ user, onClose }: { user: User | true | null; onClose: () => void }) {
    const editing = typeof user === 'object' ? user : null;
    const stores = useSession((s) => s.profile!.stores);
    const { data: roles } = useApi<{ roles: RoleOption[] }>('roles');
    const form = useForm(blank);

    useEffect(() => {
        if (!user) return;
        form.reset(
            editing
                ? { name: editing.name, email: editing.email, phone: editing.phone ?? '', password: '', role_id: String(editing.role_id), store_ids: editing.stores.map((s) => s.id), is_active: editing.is_active }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const save = useAction(() => (editing ? api.put(`users/${editing.id}`, form.values) : api.post('users', form.values)), {
        success: editing ? 'User updated' : 'User created',
        onInvalid: form.invalid,
        onSuccess: onClose,
    });

    const role = roles?.roles.find((r) => String(r.id) === String(form.values.role_id));
    const seesEverything = role?.permissions.some((p) => p === '*' || p === 'stores.all');

    const toggleStore = (id: number) => form.set('store_ids', form.values.store_ids.includes(id) ? form.values.store_ids.filter((s) => s !== id) : [...form.values.store_ids, id]);

    return (
        <Modal
            open={user !== null}
            onClose={onClose}
            variant="sheet"
            title={editing ? 'Edit user' : 'New user'}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel={editing ? 'Save changes' : 'Create user'} />}
        >
            <div className="space-y-4">
                <Input label="Full name" required {...form.bind('name')} />
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Email" required type="email" autoComplete="off" {...form.bind('email')} />
                    <Input label="Phone" optional {...form.bind('phone')} />
                </div>
                <Input
                    label={editing ? 'New password' : 'Password'}
                    type="password"
                    autoComplete="new-password"
                    required={!editing}
                    optional={!!editing}
                    hint={editing ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
                    {...form.bind('password')}
                />
                <Select label="Role" required {...form.bind('role_id')}>
                    <option value="">Choose a role</option>
                    {roles?.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.name}
                        </option>
                    ))}
                </Select>

                <div>
                    <span className="mb-1.5 block text-[13px] font-medium">Stores</span>
                    {seesEverything ? (
                        <p className="rounded-lg border border-line bg-canvas/60 px-4 py-3 text-[13px] text-ink-2">The {role?.name} role can access every store.</p>
                    ) : (
                        <div className="space-y-2.5 rounded-2xl border border-line p-4">
                            {stores.map((store) => (
                                <Checkbox key={store.id} checked={form.values.store_ids.includes(store.id)} onChange={() => toggleStore(store.id)} label={store.name} />
                            ))}
                        </div>
                    )}
                </div>

                {editing && <Switch checked={form.values.is_active} onChange={(v) => form.set('is_active', v)} label="Can sign in" description="Turn off to block access without deleting the account." />}
            </div>
        </Modal>
    );
}

export default function Users() {
    const me = useSession((s) => s.profile!.user.id);
    const [search, setSearch] = useState('');
    const term = useDebounced(search);
    const editor = useDisclosure<User | true>();
    const { data, isLoading, setPage } = usePaged<User>('users', { search: term });

    const columns: Column<User>[] = [
        {
            key: 'name',
            header: 'User',
            cell: (u) => (
                <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{initials(u.name)}</span>
                    <div className="min-w-0">
                        <p className="truncate font-medium">
                            {u.name}
                            {u.id === me && <span className="ml-2 text-xs font-normal text-ink-3">You</span>}
                        </p>
                        <p className="truncate text-xs text-ink-3">{u.email}</p>
                    </div>
                </div>
            ),
        },
        { key: 'role', header: 'Role', cell: (u) => <Badge tone={u.role.name === 'Owner' ? 'brand' : 'neutral'}>{u.role.name}</Badge> },
        {
            key: 'stores',
            header: 'Stores',
            hide: 'md',
            cell: (u) => <span className="text-ink-2">{u.stores.length ? u.stores.map((s) => s.name).join(', ') : <span className="text-ink-3">By role</span>}</span>,
        },
        { key: 'seen', header: 'Last sign-in', hide: 'lg', cell: (u) => <span className="num text-ink-2">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</span> },
        { key: 'status', header: 'Status', cell: (u) => <ActiveBadge active={u.is_active} /> },
    ];

    return (
        <Page>
            <PageHeader
                title="Settings"
                description="Who can sign in, and what they can see."
                actions={
                    <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                        New user
                    </Button>
                }
            />
            <SettingsTabs />

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name or email" />
                </Toolbar>
                <DataTable columns={columns} rows={data?.data} loading={isLoading} onRowClick={(u) => editor.open(u)} empty={<Empty icon={<UserCog />} title="No users found" />} />
                <Pager meta={data} onPage={setPage} />
            </Card>

            <UserForm user={editor.state} onClose={editor.close} />
        </Page>
    );
}

import { Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { Card, Page, PageHeader } from '@/components/ui/Layout';
import { Confirm } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAction, useApi, useForm } from '@/lib/hooks';
import { SettingsTabs } from './common';

interface Role {
    id: number;
    name: string;
    description: string | null;
    permissions: string[];
    is_system: boolean;
    users_count: number;
}

interface RolesData {
    roles: Role[];
    catalogue: { group: string; permissions: { key: string; label: string }[] }[];
}

const blank = { name: '', description: '', permissions: [] as string[] };

export default function Roles() {
    const { data } = useApi<RolesData>('roles');
    const [selected, setSelected] = useState<number | 'new' | null>(null);
    const [confirming, setConfirming] = useState(false);
    const form = useForm(blank);

    const role = typeof selected === 'number' ? data?.roles.find((r) => r.id === selected) : undefined;
    const locked = role?.is_system ?? false;

    // Open the first editable role once the list arrives.
    useEffect(() => {
        if (data && selected === null) setSelected(data.roles.find((r) => !r.is_system)?.id ?? data.roles[0]?.id ?? 'new');
    }, [data, selected]);

    useEffect(() => {
        if (selected === 'new') form.reset(blank);
        else if (role) form.reset({ name: role.name, description: role.description ?? '', permissions: role.permissions });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, role?.id]);

    const save = useAction(() => (role ? api.put<Role>(`roles/${role.id}`, form.values) : api.post<Role>('roles', form.values)), {
        success: 'Role saved',
        onInvalid: form.invalid,
        onSuccess: (saved) => setSelected(saved.id),
    });

    const remove = useAction(() => api.delete(`roles/${role!.id}`), {
        success: 'Role deleted',
        onSuccess: () => {
            setConfirming(false);
            setSelected(null);
        },
    });

    if (!data) return <PageLoader />;

    const granted = (key: string) => locked || form.values.permissions.includes(key);
    const toggle = (key: string) => form.set('permissions', granted(key) ? form.values.permissions.filter((p) => p !== key) : [...form.values.permissions, key]);

    const toggleGroup = (keys: string[]) => {
        const all = keys.every(granted);
        form.set('permissions', all ? form.values.permissions.filter((p) => !keys.includes(p)) : [...new Set([...form.values.permissions, ...keys])]);
    };

    return (
        <Page>
            <PageHeader title="Settings" description="A role is a set of permissions. Every user has exactly one." />
            <SettingsTabs />

            <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                <Card className="p-1.5">
                    <ul className="space-y-px">
                        {data.roles.map((r) => (
                            <li key={r.id}>
                                <button
                                    onClick={() => setSelected(r.id)}
                                    className={cn('flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left', selected === r.id ? 'bg-sunken' : 'hover:bg-canvas')}
                                >
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
                                            {r.name}
                                            {r.is_system && <Lock className="size-3 text-ink-3" />}
                                        </span>
                                        <span className="text-xs text-ink-3">
                                            {r.users_count} {r.users_count === 1 ? 'user' : 'users'}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-1.5 border-t border-line pt-1.5">
                        <button
                            onClick={() => setSelected('new')}
                            className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13.5px] font-medium text-brand dark:text-brand-strong', selected === 'new' ? 'bg-sunken' : 'hover:bg-canvas')}
                        >
                            <Plus className="size-4" /> New role
                        </button>
                    </div>
                </Card>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        save.mutate();
                    }}
                >
                    <Card>
                        <div className="grid gap-4 border-b border-line p-5 sm:grid-cols-2">
                            <Input label="Role name" required disabled={locked} {...form.bind('name')} />
                            <Input label="Description" optional disabled={locked} {...form.bind('description')} />
                        </div>

                        {locked && (
                            <p className="flex items-center gap-2 border-b border-line bg-canvas/60 px-5 py-3 text-[13px] text-ink-2">
                                <Lock className="size-3.5" /> The owner role always has every permission and cannot be edited.
                            </p>
                        )}

                        <div className="divide-y divide-line">
                            {data.catalogue.map((group) => {
                                const keys = group.permissions.map((p) => p.key);
                                const count = keys.filter(granted).length;

                                return (
                                    <div key={group.group} className="grid gap-x-8 gap-y-3 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)]">
                                        <div>
                                            <p className="text-[13.5px] font-medium">{group.group}</p>
                                            {!locked && (
                                                <button type="button" onClick={() => toggleGroup(keys)} className="mt-0.5 text-xs text-ink-3 hover:text-brand">
                                                    {count === keys.length ? 'Clear all' : 'Select all'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                                            {group.permissions.map((permission) => (
                                                <Checkbox key={permission.key} checked={granted(permission.key)} disabled={locked} onChange={() => toggle(permission.key)} label={permission.label} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {!locked && (
                            <div className="flex items-center justify-between border-t border-line bg-canvas/60 px-5 py-3.5">
                                {role ? (
                                    <Button variant="ghost" icon={<Trash2 />} className="text-bad hover:bg-bad-soft hover:text-bad" disabled={role.users_count > 0} title={role.users_count > 0 ? 'Move its users to another role first' : undefined} onClick={() => setConfirming(true)}>
                                        Delete role
                                    </Button>
                                ) : (
                                    <span />
                                )}
                                <Button type="submit" variant="primary" loading={save.isPending}>
                                    {role ? 'Save changes' : 'Create role'}
                                </Button>
                            </div>
                        )}
                    </Card>
                </form>
            </div>

            <Confirm open={confirming} onClose={() => setConfirming(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title="Delete role?" message={<>The <strong className="font-medium text-ink">{role?.name}</strong> role will be removed.</>} />
        </Page>
    );
}

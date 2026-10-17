import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Tabs, Toolbar } from '@/components/ui/Layout';
import { MenuItem, RowMenu } from '@/components/ui/Menu';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate, initials, money, moneyRound } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { StoreRef, WithSummary } from '@/lib/types';

export const employeeTabs = [
    { to: '/employees', label: 'Staff', end: true },
    { to: '/employees/payroll', label: 'Payroll' },
];

interface Employee {
    id: number;
    store_id: number;
    user_id: number | null;
    code: string;
    name: string;
    designation: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    joined_at: string | null;
    salary: number;
    status: 'active' | 'inactive';
    note: string | null;
    store: StoreRef;
    user: { id: number; name: string; email: string } | null;
}

const blank = { name: '', designation: '', store_id: '', user_id: '', phone: '', email: '', address: '', joined_at: '', salary: '', status: 'active', note: '' };

function EmployeeForm({ employee, onClose }: { employee: Employee | true | null; onClose: () => void }) {
    const editing = typeof employee === 'object' ? employee : null;
    const can = useCan();
    const stores = useSession((s) => s.profile!.stores);
    const storeId = useSession((s) => s.storeId);
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const { data: users } = useApi<{ id: number; name: string; email: string }[]>('users/options', undefined, { enabled: employee !== null && can('employees.manage') });
    const form = useForm(blank);

    useEffect(() => {
        if (!employee) return;
        form.reset(
            editing
                ? {
                      ...blank,
                      ...Object.fromEntries(Object.entries(editing).filter(([key]) => key in blank).map(([key, value]) => [key, value === null ? '' : String(value)])),
                  }
                : { ...blank, store_id: String(storeId ?? stores[0]?.id ?? '') },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee]);

    const save = useAction(
        () => {
            const payload = Object.fromEntries(Object.entries(form.values).map(([key, value]) => [key, value === '' ? null : value]));
            return editing ? api.put(`employees/${editing.id}`, payload) : api.post('employees', payload);
        },
        { success: editing ? 'Changes saved' : 'Employee added', onInvalid: form.invalid, onSuccess: onClose },
    );

    return (
        <Modal
            open={employee !== null}
            onClose={onClose}
            variant="sheet"
            title={editing ? 'Edit employee' : 'New employee'}
            description={editing?.code}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} />}
        >
            <div className="grid grid-cols-2 gap-4">
                <Input wrapperClassName="col-span-2" label="Full name" required {...form.bind('name')} />
                <Input label="Job title" optional placeholder="e.g. Cashier" {...form.bind('designation')} />
                <Select label="Works at" required {...form.bind('store_id')}>
                    <option value="">Choose a store</option>
                    {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                            {store.name}
                        </option>
                    ))}
                </Select>
                <Input label="Monthly salary" required type="number" min="0" step="0.01" prefix={symbol} {...form.bind('salary')} />
                <Input label="Joined on" optional type="date" {...form.bind('joined_at')} />
                <Input label="Phone" optional inputMode="tel" {...form.bind('phone')} />
                <Input label="Email" optional type="email" {...form.bind('email')} />
                <Input wrapperClassName="col-span-2" label="Address" optional {...form.bind('address')} />
                <Select wrapperClassName="col-span-2" label="Login account" optional hint="Link the user this person signs in with, if they have one." {...form.bind('user_id')}>
                    <option value="">No login</option>
                    {users?.map((user) => (
                        <option key={user.id} value={user.id}>
                            {user.name} — {user.email}
                        </option>
                    ))}
                </Select>
                <Select label="Status" {...form.bind('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </Select>
                <Input wrapperClassName="col-span-2" label="Note" optional {...form.bind('note')} />
            </div>
        </Modal>
    );
}

export default function Employees() {
    const can = useCan();
    const manage = can('employees.manage');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const term = useDebounced(search);
    const editor = useDisclosure<Employee | true>();
    const removal = useDisclosure<Employee>();

    const { data, isLoading, setPage } = usePaged<Employee, WithSummary<Employee, { total: number; active: number; monthly_payroll: number; stores: number }>>('employees', {
        search: term,
        status,
    });
    const remove = useAction((id: number) => api.delete(`employees/${id}`), { success: 'Employee removed', onSuccess: removal.close });

    const columns: Column<Employee>[] = [
        {
            key: 'name',
            header: 'Employee',
            cell: (e) => (
                <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{initials(e.name)}</span>
                    <Stack primary={e.name} secondary={<span className="font-mono">{e.code}</span>} />
                </div>
            ),
        },
        { key: 'role', header: 'Job title', cell: (e) => <span className="text-ink-2">{e.designation ?? '—'}</span> },
        { key: 'store', header: 'Store', hide: 'md', cell: (e) => <span className="text-ink-2">{e.store.name}</span> },
        { key: 'phone', header: 'Phone', hide: 'lg', cell: (e) => <span className="num text-ink-2">{e.phone ?? '—'}</span> },
        { key: 'joined', header: 'Joined', hide: 'lg', cell: (e) => <span className="num text-ink-2">{formatDate(e.joined_at)}</span> },
        { key: 'salary', header: 'Monthly salary', align: 'right', cell: (e) => <span className="num font-medium">{money(e.salary)}</span> },
        { key: 'status', header: 'Status', hide: 'sm', cell: (e) => <Badge tone={e.status === 'active' ? 'good' : 'neutral'}>{e.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-12',
                      cell: (e: Employee) => (
                          <RowMenu>
                              <MenuItem icon={<Pencil />} onSelect={() => editor.open(e)}>
                                  Edit
                              </MenuItem>
                              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => removal.open(e)}>
                                  Remove
                              </MenuItem>
                          </RowMenu>
                      ),
                  } satisfies Column<Employee>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader
                title="Employees"
                description="The people on your payroll."
                actions={
                    manage && (
                        <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                            New employee
                        </Button>
                    )
                }
            />
            <Tabs tabs={employeeTabs} />

            <StatRow>
                <Stat label="Employees" value={data?.summary.total ?? 0} />
                <Stat label="Active" value={data?.summary.active ?? 0} hint={data ? `${data.summary.total - data.summary.active} inactive` : undefined} />
                <Stat label="Monthly salaries" value={moneyRound(data?.summary.monthly_payroll)} />
                <Stat label="Stores staffed" value={data?.summary.stores ?? 0} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name, ID or phone" />
                    <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
                        <option value="">Any status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </Select>
                </Toolbar>
                <DataTable columns={columns} rows={data?.data} loading={isLoading} onRowClick={manage ? (e) => editor.open(e) : undefined} empty={<Empty icon={<Users />} title="No employees found" />} />
                <Pager meta={data} onPage={setPage} />
            </Card>

            <EmployeeForm employee={editor.state} onClose={editor.close} />

            <Confirm
                open={removal.isOpen}
                onClose={removal.close}
                onConfirm={() => removal.state && remove.mutate(removal.state.id)}
                loading={remove.isPending}
                confirmLabel="Remove"
                title="Remove employee?"
                message={
                    <>
                        <strong className="font-medium text-ink">{removal.state?.name}</strong> will be taken off the staff list. Salary payments already made stay in the books.
                    </>
                }
            />
        </Page>
    );
}

import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PaymentBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, SearchInput, Switch, Textarea } from '@/components/ui/Field';
import { Card, Line, Page, PageHeader, Stat, StatRow, Toolbar } from '@/components/ui/Layout';
import { MenuItem, RowMenu } from '@/components/ui/Menu';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate, money, moneyRound } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useCan } from '@/lib/session';
import type { Contact, PaymentStatus, WithSummary } from '@/lib/types';

type Kind = 'customers' | 'suppliers';

interface Document {
    id: number;
    invoice_no?: string;
    reference_no?: string;
    sold_at?: string;
    purchased_at?: string;
    total: number;
    due_amount: number;
    payment_status: PaymentStatus;
}

const blank = { name: '', contact_person: '', phone: '', email: '', address: '', note: '', is_active: true };

function ContactForm({ type, contact, onClose }: { type: Kind; contact: Contact | true | null; onClose: () => void }) {
    const editing = typeof contact === 'object' ? contact : null;
    const singular = type === 'customers' ? 'customer' : 'supplier';
    const form = useForm(blank);

    useEffect(() => {
        if (!contact) return;
        form.reset(
            editing
                ? {
                      name: editing.name,
                      contact_person: editing.contact_person ?? '',
                      phone: editing.phone ?? '',
                      email: editing.email ?? '',
                      address: editing.address ?? '',
                      note: editing.note ?? '',
                      is_active: editing.is_active,
                  }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contact]);

    const save = useAction(() => (editing ? api.put(`${type}/${editing.id}`, form.values) : api.post(type, form.values)), {
        success: editing ? 'Changes saved' : `${singular[0].toUpperCase()}${singular.slice(1)} added`,
        onInvalid: form.invalid,
        onSuccess: onClose,
    });

    return (
        <Modal
            open={contact !== null}
            onClose={onClose}
            title={editing ? `Edit ${singular}` : `New ${singular}`}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} />}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Input wrapperClassName="sm:col-span-2" label={type === 'suppliers' ? 'Company name' : 'Name'} required {...form.bind('name')} />
                {type === 'suppliers' && <Input wrapperClassName="sm:col-span-2" label="Contact person" optional {...form.bind('contact_person')} />}
                <Input label="Phone" optional inputMode="tel" {...form.bind('phone')} />
                <Input label="Email" optional type="email" {...form.bind('email')} />
                <Input wrapperClassName="sm:col-span-2" label="Address" optional {...form.bind('address')} />
                <Textarea wrapperClassName="sm:col-span-2" label="Note" optional rows={2} {...form.bind('note')} />
                {editing && (
                    <div className="sm:col-span-2">
                        <Switch checked={form.values.is_active} onChange={(v) => form.set('is_active', v)} label="Active" description="Inactive contacts are hidden from pickers." />
                    </div>
                )}
            </div>
        </Modal>
    );
}

function ContactPanel({ type, id, onClose }: { type: Kind; id: number | null; onClose: () => void }) {
    const { data } = useApi<Contact & { documents: Document[] }>(`${type}/${id}`, undefined, { enabled: id !== null });
    const customers = type === 'customers';
    const contact = id !== null && data?.id === id ? data : null;

    return (
        <Modal open={id !== null} onClose={onClose} variant="sheet" title={contact?.name ?? ' '} description={contact?.phone ?? undefined} flush>
            {!contact ? (
                <PageLoader />
            ) : (
                <>
                    <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
                        {[
                            [customers ? 'Invoices' : 'Purchases', String((customers ? contact.sales_count : contact.purchases_count) ?? 0)],
                            [customers ? 'Spent' : 'Bought', money(customers ? contact.total_spent : contact.total_purchased)],
                            [customers ? 'Owes you' : 'You owe', money(contact.total_due)],
                        ].map(([label, value], index) => (
                            <div key={label} className="px-2 py-4">
                                <p className="text-xs text-ink-3">{label}</p>
                                <p className={`num mt-0.5 text-[15px] font-semibold ${index === 2 && (contact.total_due ?? 0) > 0 ? 'text-bad' : ''}`}>{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="border-b border-line px-5 py-3">
                        {contact.contact_person && <Line label="Contact" value={contact.contact_person} />}
                        <Line label="Email" value={contact.email ?? '—'} />
                        <Line label="Address" value={contact.address ?? '—'} />
                        {contact.note && <Line label="Note" value={contact.note} />}
                    </div>

                    <h3 className="px-5 pt-4 pb-2 text-sm font-semibold">{customers ? 'Recent invoices' : 'Recent purchases'}</h3>
                    {contact.documents.length === 0 ? (
                        <p className="px-5 py-6 text-center text-[13px] text-ink-3">Nothing recorded yet.</p>
                    ) : (
                        <ul className="divide-y divide-line border-t border-line">
                            {contact.documents.map((doc) => (
                                <li key={doc.id}>
                                    <Link to={`/${customers ? 'sales' : 'purchases'}/${doc.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] hover:bg-canvas/70">
                                        <span>
                                            <span className="block font-mono text-[12.5px] font-medium">{doc.invoice_no ?? doc.reference_no}</span>
                                            <span className="text-xs text-ink-3">{formatDate(doc.sold_at ?? doc.purchased_at)}</span>
                                        </span>
                                        <span className="flex items-center gap-2.5">
                                            {doc.payment_status !== 'paid' && <PaymentBadge status={doc.payment_status} />}
                                            <span className="num font-medium">{money(doc.total)}</span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </Modal>
    );
}

export default function Contacts({ type }: { type: Kind }) {
    const can = useCan();
    const manage = can(`${type}.manage`);
    const customers = type === 'customers';
    const [search, setSearch] = useState('');
    const [withDue, setWithDue] = useState(false);
    const term = useDebounced(search);
    const editor = useDisclosure<Contact | true>();
    const removal = useDisclosure<Contact>();
    const [viewing, setViewing] = useState<number | null>(null);

    const { data, isLoading, setPage } = usePaged<Contact, WithSummary<Contact, { count: number; with_balance: number; total: number; due: number }>>(type, {
        search: term,
        with_due: withDue ? 1 : undefined,
    });
    const remove = useAction((id: number) => api.delete(`${type}/${id}`), { success: 'Deleted', onSuccess: removal.close });

    const columns: Column<Contact>[] = [
        { key: 'name', header: customers ? 'Customer' : 'Supplier', cell: (c) => <Stack primary={c.name} secondary={customers ? c.address : c.contact_person} /> },
        { key: 'phone', header: 'Phone', cell: (c) => <span className="num text-ink-2">{c.phone ?? '—'}</span> },
        {
            key: 'count',
            header: customers ? 'Invoices' : 'Purchases',
            align: 'right',
            hide: 'md',
            cell: (c) => <span className="num text-ink-2">{(customers ? c.sales_count : c.purchases_count) ?? 0}</span>,
        },
        {
            key: 'total',
            header: customers ? 'Total spent' : 'Total bought',
            align: 'right',
            hide: 'sm',
            cell: (c) => <span className="num">{money(customers ? c.total_spent : c.total_purchased)}</span>,
        },
        {
            key: 'due',
            header: customers ? 'Owes you' : 'You owe',
            align: 'right',
            cell: (c) => ((c.total_due ?? 0) > 0 ? <span className="num font-medium text-bad">{money(c.total_due)}</span> : <span className="text-ink-3">—</span>),
        },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-12',
                      cell: (c: Contact) => (
                          <RowMenu>
                              <MenuItem icon={<Pencil />} onSelect={() => editor.open(c)}>
                                  Edit
                              </MenuItem>
                              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => removal.open(c)}>
                                  Delete
                              </MenuItem>
                          </RowMenu>
                      ),
                  } satisfies Column<Contact>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader
                title={customers ? 'Customers' : 'Suppliers'}
                description={customers ? 'People who buy from you, and what they still owe.' : 'Who you buy stock from, and what you still owe them.'}
                actions={
                    manage && (
                        <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                            New {customers ? 'customer' : 'supplier'}
                        </Button>
                    )
                }
            />

            <StatRow>
                <Stat label={customers ? 'Customers' : 'Suppliers'} value={(data?.summary.count ?? 0).toLocaleString()} />
                <Stat label={customers ? 'Total sold to them' : 'Total bought from them'} value={moneyRound(data?.summary.total)} />
                <Stat label="With a balance" value={data?.summary.with_balance ?? 0} />
                <Stat label={customers ? 'They owe you' : 'You owe them'} value={moneyRound(data?.summary.due)} tone={data?.summary.due ? 'bad' : 'default'} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name or phone" />
                    <Checkbox checked={withDue} onChange={setWithDue} label="Only with a balance" />
                </Toolbar>
                <DataTable
                    columns={columns}
                    rows={data?.data}
                    loading={isLoading}
                    onRowClick={(c) => setViewing(c.id)}
                    empty={<Empty icon={<Users />} title={`No ${type} found`} />}
                />
                <Pager meta={data} onPage={setPage} />
            </Card>

            <ContactForm type={type} contact={editor.state} onClose={editor.close} />
            <ContactPanel type={type} id={viewing} onClose={() => setViewing(null)} />

            <Confirm
                open={removal.isOpen}
                onClose={removal.close}
                onConfirm={() => removal.state && remove.mutate(removal.state.id)}
                loading={remove.isPending}
                title={`Delete ${customers ? 'customer' : 'supplier'}?`}
                message={
                    <>
                        <strong className="font-medium text-ink">{removal.state?.name}</strong> will be removed from your lists. Their past {customers ? 'invoices' : 'purchases'} are kept.
                    </>
                }
            />
        </Page>
    );
}

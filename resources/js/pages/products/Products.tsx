import { ImagePlus, Package, Pencil, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BarcodeLabels } from '@/components/BarcodeLabels';
import { ActiveBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, SearchInput, Select, Switch, Textarea } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Tabs, Toolbar } from '@/components/ui/Layout';
import { RowMenu, MenuItem } from '@/components/ui/Menu';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { money, percent, qty } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useCan, useCurrentStore, useSession } from '@/lib/session';
import type { Named, Product, Unit, WithSummary } from '@/lib/types';

export const productTabs = [
    { to: '/products', label: 'Products', end: true },
    { to: '/products/categories', label: 'Categories' },
    { to: '/products/brands', label: 'Brands' },
    { to: '/products/units', label: 'Units' },
];

interface Options {
    categories: Named[];
    brands: Named[];
    units: Unit[];
}

const blank = {
    name: '',
    size: '',
    sku: '',
    barcode: '',
    category_id: '',
    brand_id: '',
    unit_id: '',
    cost_price: '',
    sale_price: '',
    tax_rate: '',
    reorder_level: '',
    opening_stock: '',
    description: '',
    is_active: true,
};

interface PhotoFieldProps {
    /** What to show: a freshly picked file's preview, the saved photo, or nothing. */
    preview: string | null;
    onPick: (file: File) => void;
    onRemove: () => void;
}

function PhotoField({ preview, onPick, onRemove }: PhotoFieldProps) {
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const accept = (file: File | undefined) => {
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return void toast.error('Choose a JPG, PNG or WebP photo.');
        if (file.size > 8 * 1024 * 1024) return void toast.error('The photo is too large. Choose one under 8 MB.');
        onPick(file);
    };

    return (
        <div className="flex items-center gap-4">
            <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    accept(event.dataTransfer.files[0]);
                }}
                aria-label={preview ? 'Change photo' : 'Add a photo'}
                className={cn(
                    'group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-[20px] border-2 border-dashed transition-[border-color,background-color] duration-300',
                    dragging ? 'border-ink bg-brand-soft' : preview ? 'border-transparent' : 'border-line-strong bg-sunken hover:border-ink',
                )}
            >
                {preview ? (
                    <>
                        <img src={preview} alt="" className="size-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                            <ImagePlus className="size-5" />
                        </span>
                    </>
                ) : (
                    <ImagePlus className="size-6 text-ink-3 transition-transform duration-300 group-hover:scale-110" />
                )}
            </button>

            <div className="min-w-0">
                <p className="text-[13px] font-medium">Photo</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-3">Shown on the register. JPG, PNG or WebP, up to 8 MB — drop one here or browse.</p>
                <div className="mt-2 flex gap-1.5">
                    <Button size="sm" onClick={() => input.current?.click()}>
                        {preview ? 'Change' : 'Browse'}
                    </Button>
                    {preview && (
                        <Button size="sm" variant="ghost" onClick={onRemove}>
                            Remove
                        </Button>
                    )}
                </div>
            </div>

            <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                    accept(event.target.files?.[0]);
                    event.target.value = '';
                }}
            />
        </div>
    );
}

function ProductForm({ product, options, onClose }: { product: Product | true | null; options?: Options; onClose: () => void }) {
    const editing = typeof product === 'object' && product !== null ? product : null;
    const store = useCurrentStore();
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const form = useForm(blank);
    // undefined = leave the photo alone, a File = replace it, null = remove it.
    const [photo, setPhoto] = useState<File | null | undefined>(undefined);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!(photo instanceof File)) return setPhotoPreview(null);
        const url = URL.createObjectURL(photo);
        setPhotoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photo]);

    useEffect(() => {
        if (!product) return;
        setPhoto(undefined);
        form.reset(
            editing
                ? {
                      ...blank,
                      ...Object.fromEntries(Object.entries(editing).filter(([key]) => key in blank).map(([key, value]) => [key, value ?? ''])),
                      is_active: editing.is_active,
                  }
                : { ...blank, unit_id: String(options?.units.find((u) => u.short_name === 'pc')?.id ?? options?.units[0]?.id ?? '') },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    const save = useAction(
        async () => {
            const payload = Object.fromEntries(Object.entries(form.values).map(([key, value]) => [key, value === '' ? null : value]));
            const response = editing ? await api.put<Product>(`products/${editing.id}`, payload) : await api.post<Product>('products', payload);

            // The photo travels separately: the product has to exist before a file can be attached to it.
            if (photo instanceof File) {
                const body = new FormData();
                body.append('image', photo);
                await api.post(`products/${response.data.id}/image`, body);
            } else if (photo === null && editing?.image_url) {
                await api.delete(`products/${response.data.id}/image`);
            }

            return response;
        },
        { success: editing ? 'Product updated' : 'Product created', onInvalid: form.invalid, onSuccess: onClose },
    );

    const cost = parseFloat(String(form.values.cost_price)) || 0;
    const price = parseFloat(String(form.values.sale_price)) || 0;
    const margin = price > 0 ? ((price - cost) / price) * 100 : null;

    return (
        <Modal
            open={product !== null}
            onClose={onClose}
            variant="sheet"
            title={editing ? 'Edit product' : 'New product'}
            description={editing ? editing.sku : 'Products are shared by every store; stock is kept per store.'}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel={editing ? 'Save changes' : 'Create product'} />}
        >
            <div className="space-y-5">
                <PhotoField preview={photoPreview ?? (photo === null ? null : (editing?.image_url ?? null))} onPick={setPhoto} onRemove={() => setPhoto(null)} />

                <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-4">
                    <Input label="Name" required {...form.bind('name')} />
                    <Input label="Size" optional placeholder="125 g, XL…" {...form.bind('size')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input label="SKU" optional={!editing} hint={editing ? undefined : 'Leave blank to generate one.'} className="font-mono" {...form.bind('sku')} />
                    <Input label="Barcode" optional className="font-mono" {...form.bind('barcode')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Select label="Category" optional {...form.bind('category_id')}>
                        <option value="">None</option>
                        {options?.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </Select>
                    <Select label="Brand" optional {...form.bind('brand_id')}>
                        <option value="">None</option>
                        {options?.brands.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="rounded-2xl border border-line p-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Cost price" type="number" min="0" step="0.01" required prefix={symbol} {...form.bind('cost_price')} />
                        <Input label="Selling price" type="number" min="0" step="0.01" required prefix={symbol} {...form.bind('sale_price')} />
                    </div>
                    <p className="mt-3 text-xs text-ink-3">
                        {margin === null ? (
                            'Enter both prices to see the margin.'
                        ) : (
                            <>
                                Margin <span className={cn('num font-medium', margin < 0 ? 'text-bad' : 'text-ink')}>{percent(margin)}</span> · profit{' '}
                                <span className="num font-medium text-ink">{money(price - cost)}</span> per unit
                            </>
                        )}
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <Select label="Sold by" required {...form.bind('unit_id')}>
                        <option value="">Unit</option>
                        {options?.units.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name}
                            </option>
                        ))}
                    </Select>
                    <Input label="Tax" type="number" min="0" max="100" step="0.01" suffix="%" placeholder="0" {...form.bind('tax_rate')} />
                    <Input label="Reorder at" type="number" min="0" step="any" placeholder="0" {...form.bind('reorder_level')} />
                </div>

                {!editing && (
                    <Input
                        label="Opening stock"
                        optional
                        type="number"
                        min="0"
                        step="any"
                        disabled={!store}
                        hint={store ? `Added to ${store.name} as an opening balance.` : 'Pick a store from the switcher to set opening stock.'}
                        {...form.bind('opening_stock')}
                    />
                )}

                <Textarea label="Description" optional {...form.bind('description')} />

                <Switch checked={form.values.is_active} onChange={(v) => form.set('is_active', v)} label="Available for sale" description="Inactive products are hidden from the register." />
            </div>
        </Modal>
    );
}

export default function Products() {
    const can = useCan();
    const manage = can('products.manage');
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [status, setStatus] = useState('');
    const term = useDebounced(search);
    const form = useDisclosure<Product | true>();
    const removal = useDisclosure<Product>();
    const labels = useDisclosure<Product[]>();

    const { data: options } = useApi<Options>('products/options');
    const { data, isLoading, setPage } = usePaged<Product, WithSummary<Product, { total: number; active: number; categories: number; brands: number }>>('products', {
        search: term,
        category_id: categoryId,
        status,
    });

    const remove = useAction((id: number) => api.delete(`products/${id}`), { success: 'Product deleted', onSuccess: removal.close });

    const columns: Column<Product>[] = [
        {
            key: 'name',
            header: 'Product',
            cell: (p) => (
                <div className="flex items-center gap-3">
                    {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" className="size-10 shrink-0 rounded-xl bg-sunken object-cover" />
                    ) : (
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunken text-ink-3">
                            <Package className="size-4" />
                        </span>
                    )}
                    <Stack
                        primary={p.name}
                        secondary={
                            <>
                                <span className="font-mono">{p.sku}</span>
                                {p.size && <span className="ml-2">{p.size}</span>}
                            </>
                        }
                    />
                </div>
            ),
        },
        { key: 'category', header: 'Category', hide: 'md', cell: (p) => <span className="text-ink-2">{p.category?.name ?? '—'}</span> },
        { key: 'brand', header: 'Brand', hide: 'lg', cell: (p) => <span className="text-ink-2">{p.brand?.name ?? '—'}</span> },
        { key: 'cost', header: 'Cost', align: 'right', hide: 'sm', cell: (p) => <span className="num text-ink-2">{money(p.cost_price)}</span> },
        { key: 'price', header: 'Price', align: 'right', cell: (p) => <span className="num font-medium">{money(p.sale_price)}</span> },
        {
            key: 'margin',
            header: 'Margin',
            align: 'right',
            hide: 'lg',
            cell: (p) => <span className="num text-ink-2">{p.sale_price > 0 ? percent(((p.sale_price - p.cost_price) / p.sale_price) * 100) : '—'}</span>,
        },
        {
            key: 'stock',
            header: 'In stock',
            align: 'right',
            cell: (p) => {
                const stock = p.stock ?? 0;
                return (
                    <span className={cn('num', stock <= 0 ? 'font-medium text-bad' : stock <= p.reorder_level ? 'font-medium text-warn' : 'text-ink')}>
                        {qty(stock)} <span className="font-normal text-ink-3">{p.unit?.short_name}</span>
                    </span>
                );
            },
        },
        { key: 'status', header: 'Status', hide: 'md', cell: (p) => <ActiveBadge active={p.is_active} /> },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-12',
                      cell: (p: Product) => (
                          <RowMenu>
                              <MenuItem icon={<Pencil />} onSelect={() => form.open(p)}>
                                  Edit
                              </MenuItem>
                              <MenuItem icon={<ScanBarcode />} onSelect={() => labels.open([p])}>
                                  Print barcode
                              </MenuItem>
                              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => removal.open(p)}>
                                  Delete
                              </MenuItem>
                          </RowMenu>
                      ),
                  } satisfies Column<Product>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader
                title="Products"
                description="One catalogue for every store."
                actions={
                    <>
                        <Button icon={<ScanBarcode />} onClick={() => labels.open([])}>
                            Print barcodes
                        </Button>
                        {manage && (
                            <Button variant="primary" icon={<Plus />} onClick={() => form.open(true)}>
                                New product
                            </Button>
                        )}
                    </>
                }
            />
            <Tabs tabs={productTabs} />

            <StatRow>
                <Stat label="Products" value={(data?.summary.total ?? 0).toLocaleString()} />
                <Stat label="Available for sale" value={(data?.summary.active ?? 0).toLocaleString()} hint={data ? `${data.summary.total - data.summary.active} inactive` : undefined} />
                <Stat label="Categories" value={data?.summary.categories ?? 0} />
                <Stat label="Brands" value={data?.summary.brands ?? 0} />
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
                    <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
                        <option value="">Any status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </Select>
                </Toolbar>
                <DataTable
                    columns={columns}
                    rows={data?.data}
                    loading={isLoading}
                    onRowClick={manage ? (p) => form.open(p) : undefined}
                    empty={<Empty icon={<Package />} title="No products found" hint="Adjust the search or add a new product." />}
                />
                <Pager meta={data} onPage={setPage} />
            </Card>

            <ProductForm product={form.state} options={options} onClose={form.close} />
            <BarcodeLabels open={labels.isOpen} onClose={labels.close} initial={labels.state ?? undefined} />

            <Confirm
                open={removal.isOpen}
                onClose={removal.close}
                onConfirm={() => removal.state && remove.mutate(removal.state.id)}
                loading={remove.isPending}
                title="Delete product?"
                message={
                    <>
                        <strong className="font-medium text-ink">{removal.state?.name}</strong> will disappear from the catalogue and the register. Past sales and stock history are kept.
                    </>
                }
            />
        </Page>
    );
}

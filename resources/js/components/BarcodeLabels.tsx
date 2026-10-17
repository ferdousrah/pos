import { Minus, Plus, Printer, ScanBarcode, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { PrintPortal } from './PrintPortal';
import { ProductPicker } from './ProductPicker';
import { Button } from './ui/Button';
import { Checkbox, Segmented, Select } from './ui/Field';
import { Modal } from './ui/Modal';

export interface LabelProduct {
    id: number;
    name: string;
    size?: string | null;
    sku: string;
    barcode: string | null;
    sale_price: number;
}

interface LabelLine {
    product: LabelProduct;
    copies: number;
}

/** Common thermal label stock, in millimetres. */
const sizes = {
    '50x25': { label: '50 × 25 mm', width: 50, height: 25 },
    '38x25': { label: '38 × 25 mm', width: 38, height: 25 },
    '60x40': { label: '60 × 40 mm', width: 60, height: 40 },
} as const;

type SizeKey = keyof typeof sizes;

/** True for a 13-digit code whose last digit is the correct EAN check digit. */
function isEan13(code: string) {
    if (!/^\d{13}$/.test(code)) return false;
    const sum = [...code.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/**
 * Draws the barcode as SVG, so it stays razor sharp on a 203 dpi label printer.
 * Retail EAN-13 codes are drawn as EAN-13; anything else (including our own SKUs) as Code 128.
 * Both are read by the register's scanner.
 */
function Barcode({ value, height }: { value: string; height: number }) {
    const svg = useRef<SVGSVGElement>(null);

    useEffect(() => {
        let cancelled = false;

        import('jsbarcode').then(({ default: JsBarcode }) => {
            if (cancelled || !svg.current) return;

            const options = { height, width: 2, margin: 0, fontSize: 13, textMargin: 1, font: 'monospace', background: 'transparent' };

            try {
                JsBarcode(svg.current, value, { ...options, format: isEan13(value) ? 'EAN13' : 'CODE128' });
            } catch {
                // Characters EAN/Code 128 cannot hold: leave the label without bars rather than crash.
                svg.current.replaceChildren();
            }

            // Let CSS scale the drawing to the label instead of JsBarcode's fixed pixel size.
            const width = svg.current.getAttribute('width');
            const drawn = svg.current.getAttribute('height');
            if (width && drawn) svg.current.setAttribute('viewBox', `0 0 ${parseFloat(width)} ${parseFloat(drawn)}`);
            svg.current.removeAttribute('width');
            svg.current.removeAttribute('height');
            svg.current.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        });

        return () => {
            cancelled = true;
        };
    }, [value, height]);

    return <svg ref={svg} className="block h-full w-full" />;
}

interface LabelOptions {
    size: SizeKey;
    showName: boolean;
    showSize: boolean;
    showPrice: boolean;
    showBusiness: boolean;
}

/** One label, sized in real millimetres so the preview and the print are the same thing. */
function Label({ product, options }: { product: LabelProduct; options: LabelOptions }) {
    const business = useSession((s) => s.profile!.settings.business_name);
    const { width, height } = sizes[options.size];
    const large = height >= 40;
    const code = product.barcode || product.sku;

    return (
        <div
            className="barcode-label flex flex-col items-center overflow-hidden bg-white text-center text-black"
            style={{ width: `${width}mm`, height: `${height}mm`, padding: large ? '2.5mm 3mm' : '1.2mm 2mm', fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.15 }}
        >
            {options.showBusiness && <div style={{ fontSize: large ? '2.6mm' : '1.9mm', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{business}</div>}
            {options.showName && (
                <div className="w-full truncate" style={{ fontSize: large ? '3.6mm' : '2.7mm', fontWeight: 700 }}>
                    {product.name}
                </div>
            )}
            {options.showSize && product.size && <div style={{ fontSize: large ? '3mm' : '2.2mm' }}>{product.size}</div>}

            <div className="min-h-0 w-full flex-1" style={{ margin: large ? '1mm 0' : '0.4mm 0' }}>
                <Barcode value={code} height={large ? 60 : 38} />
            </div>

            {options.showPrice && <div style={{ fontSize: large ? '4.6mm' : '3.4mm', fontWeight: 700 }}>{money(product.sale_price)}</div>}
        </div>
    );
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Products to start with, e.g. the one whose menu was used. */
    initial?: LabelProduct[];
}

export function BarcodeLabels({ open, onClose, initial }: Props) {
    const [lines, setLines] = useState<LabelLine[]>([]);
    const [layout, setLayout] = useState<'roll' | 'sheet'>('roll');
    const [options, setOptions] = useState<LabelOptions>({ size: '50x25', showName: true, showSize: true, showPrice: true, showBusiness: false });

    useEffect(() => {
        if (open) setLines((initial ?? []).map((product) => ({ product, copies: 1 })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const total = lines.reduce((sum, line) => sum + line.copies, 0);
    const { width, height } = sizes[options.size];

    // Every copy of every label, in order, ready for the printer.
    const labels = useMemo(() => lines.flatMap((line) => Array.from({ length: line.copies }, (_, copy) => ({ product: line.product, key: `${line.product.id}-${copy}` }))), [lines]);

    const setCopies = (id: number, copies: number) => setLines((current) => current.map((line) => (line.product.id === id ? { ...line, copies: Math.max(1, Math.min(500, Math.round(copies) || 1)) } : line)));

    const toggle = (key: keyof Omit<LabelOptions, 'size'>) => (value: boolean) => setOptions((current) => ({ ...current, [key]: value }));

    const print = () => {
        // The page size depends on the label, so it is set just for this print job.
        const style = document.createElement('style');
        style.textContent =
            layout === 'roll'
                ? `@page { size: ${width}mm ${height}mm; margin: 0; }`
                : '@page { size: A4; margin: 8mm; }';
        document.head.appendChild(style);
        window.print();
        style.remove();
    };

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title="Print barcode labels"
                icon={<ScanBarcode />}
                description="Pick the products, how many labels of each, and the label stock in your printer."
                size="lg"
                bodyClassName="min-h-[470px]"
                footer={
                    <>
                        <span className="mr-auto text-[13px] text-ink-2">
                            {total} {total === 1 ? 'label' : 'labels'}
                        </span>
                        <Button variant="ghost" onClick={onClose}>
                            Close
                        </Button>
                        <Button variant="primary" icon={<Printer />} disabled={total === 0} onClick={print}>
                            Print
                        </Button>
                    </>
                }
            >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
                    <div className="min-w-0">
                        <ProductPicker
                            showStock={false}
                            exclude={lines.map((line) => line.product.id)}
                            placeholder="Add a product by name, SKU or barcode"
                            onPick={(product) => setLines((current) => [...current, { product, copies: 1 }])}
                        />

                        {lines.length === 0 ? (
                            <p className="mt-10 text-center text-[13px] text-ink-3">Search above to add the products you need labels for.</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                                {lines.map((line) => (
                                    <li key={line.product.id} className="flex items-center gap-3 px-3.5 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium">
                                                {line.product.name}
                                                {line.product.size && <span className="ml-1.5 font-normal text-ink-3">{line.product.size}</span>}
                                            </p>
                                            <p className="font-mono text-xs text-ink-3">
                                                {line.product.barcode || line.product.sku}
                                                {!line.product.barcode && <span className="ml-2 font-sans text-warn">No barcode — the SKU is used</span>}
                                            </p>
                                        </div>
                                        <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-line-strong">
                                            <button type="button" aria-label="Fewer" onClick={() => setCopies(line.product.id, line.copies - 1)} className="grid h-full w-8 place-items-center text-ink-2 hover:bg-sunken hover:text-ink">
                                                <Minus className="size-3.5" />
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                max="500"
                                                aria-label={`Labels for ${line.product.name}`}
                                                value={line.copies}
                                                onChange={(event) => setCopies(line.product.id, Number(event.target.value))}
                                                onFocus={(event) => event.target.select()}
                                                className="num h-full w-12 border-x border-line bg-transparent text-center text-[13px] font-medium focus:outline-none"
                                            />
                                            <button type="button" aria-label="More" onClick={() => setCopies(line.product.id, line.copies + 1)} className="grid h-full w-8 place-items-center text-ink-2 hover:bg-sunken hover:text-ink">
                                                <Plus className="size-3.5" />
                                            </button>
                                        </div>
                                        <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setLines((current) => current.filter((item) => item.product.id !== line.product.id))}>
                                            <Trash2 />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <span className="mb-1.5 block text-[13px] font-medium">Printer</span>
                            <Segmented
                                className="flex w-full"
                                value={layout}
                                onChange={setLayout}
                                options={[
                                    { value: 'roll', label: 'Label printer' },
                                    { value: 'sheet', label: 'A4 sheet' },
                                ]}
                            />
                            <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{layout === 'roll' ? 'One label per page, for a thermal label roll.' : 'Labels laid out in rows on plain or sticker A4 paper.'}</p>
                        </div>

                        <Select label="Label size" value={options.size} onChange={(event) => setOptions((current) => ({ ...current, size: event.target.value as SizeKey }))}>
                            {Object.entries(sizes).map(([key, size]) => (
                                <option key={key} value={key}>
                                    {size.label}
                                </option>
                            ))}
                        </Select>

                        <div className="space-y-2.5">
                            <span className="block text-[13px] font-medium">Show on the label</span>
                            <Checkbox checked={options.showName} onChange={toggle('showName')} label="Product name" />
                            <Checkbox checked={options.showSize} onChange={toggle('showSize')} label="Size" />
                            <Checkbox checked={options.showPrice} onChange={toggle('showPrice')} label="Price" />
                            <Checkbox checked={options.showBusiness} onChange={toggle('showBusiness')} label="Shop name" />
                        </div>

                        <div>
                            <span className="mb-1.5 block text-[13px] font-medium">Preview</span>
                            <div className={cn('grid place-items-center rounded-2xl bg-sunken p-4', lines.length === 0 && 'h-28 text-xs text-ink-3')}>
                                {lines.length > 0 ? (
                                    <div className="shadow-card ring-1 ring-black/10">
                                        <Label product={lines[0].product} options={options} />
                                    </div>
                                ) : (
                                    'Add a product to see its label'
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* What actually reaches the printer. It lives outside the dialog so nothing can clip or offset it. */}
            {open && (
                <PrintPortal className={layout === 'roll' ? 'label-roll' : 'label-sheet'}>
                    {labels.map((label) => (
                        <Label key={label.key} product={label.product} options={options} />
                    ))}
                </PrintPortal>
            )}
        </>
    );
}

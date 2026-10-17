import * as Dialog from '@radix-ui/react-dialog';
import { Pencil, Plus, TriangleAlert, X } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

const widths = { sm: 'max-w-[420px]', md: 'max-w-[540px]', lg: 'max-w-[740px]', xl: 'max-w-[980px]' };

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    /** Shown in a badge beside the title. Forms titled "New …" or "Edit …" get one automatically. */
    icon?: ReactNode;
    tone?: 'default' | 'danger';
    size?: keyof typeof widths;
    /** "sheet" slides in from the right and suits longer forms. */
    variant?: 'dialog' | 'sheet';
    footer?: ReactNode;
    onSubmit?: () => void;
    children: ReactNode;
    bodyClassName?: string;
    /** Drop the body padding, for content that runs edge to edge such as a list. */
    flush?: boolean;
}

/** A sensible badge for the two commonest kinds of form, so every dialog does not have to pass one. */
function defaultIcon(title: ReactNode) {
    if (typeof title !== 'string') return null;
    if (/^(new|add|record)\b/i.test(title)) return <Plus />;
    if (/^(edit|change)\b/i.test(title)) return <Pencil />;
    return null;
}

export function Modal({ open, onClose, title, description, icon, tone = 'default', size = 'md', variant = 'dialog', footer, onSubmit, children, bodyClassName, flush }: ModalProps) {
    const submit = (event: FormEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onSubmit?.();
    };

    const Shell = onSubmit ? 'form' : 'div';
    const badge = icon ?? defaultIcon(title);
    const danger = tone === 'danger';

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[6px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
                <Dialog.Content
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                        // Land on the first field, not on the close button.
                        const target = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), select, textarea');
                        if (target) {
                            event.preventDefault();
                            target.focus();
                        }
                    }}
                    className={cn(
                        'fixed z-50 flex flex-col overflow-hidden bg-surface shadow-[0_40px_80px_-24px_rgb(var(--shadow-color)/0.55)] outline-none dark:ring-1 dark:ring-line-strong',
                        variant === 'dialog'
                            ? [
                                  'top-1/2 left-1/2 max-h-[calc(100dvh-3rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px]',
                                  'data-[state=closed]:animate-pop-out data-[state=open]:animate-pop',
                                  widths[size],
                              ]
                            : [
                                  'inset-y-2 right-2 w-[calc(100%-1rem)] rounded-[28px]',
                                  'data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet',
                                  size === 'lg' || size === 'xl' ? 'max-w-[660px]' : 'max-w-[480px]',
                              ],
                    )}
                >
                    {/* A wash of colour behind the header gives each dialog a lit top edge. */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-36"
                        style={{
                            background: `radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(${danger ? '--bad' : '--accent'}) ${danger ? 16 : 42}%, transparent), transparent 70%)`,
                        }}
                    />

                    <header className={cn('relative flex shrink-0 gap-3.5 px-6 pt-6 pb-4', description ? 'items-start' : 'items-center')}>
                        {badge && (
                            <span
                                className={cn(
                                    'grid size-11 shrink-0 place-items-center rounded-2xl shadow-[0_6px_16px_-8px_rgb(var(--shadow-color)/0.5)] [&_svg]:size-5',
                                    danger ? 'bg-bad text-white' : 'bg-inverse text-accent',
                                )}
                            >
                                {badge}
                            </span>
                        )}
                        <div className={cn('min-w-0 flex-1', description && (badge ? 'pt-0.5' : 'pt-1'))}>
                            <Dialog.Title className="text-[18px] leading-6 font-medium tracking-[-0.01em] text-ink">{title}</Dialog.Title>
                            {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{description}</p>}
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                aria-label="Close"
                                className="grid size-9 shrink-0 place-items-center rounded-full bg-surface/80 text-ink-2 ring-1 ring-line transition-[background-color,color,rotate] duration-300 ease-smooth hover:rotate-90 hover:bg-sunken hover:text-ink"
                            >
                                <X className="size-4" />
                            </button>
                        </Dialog.Close>
                    </header>

                    <Shell onSubmit={onSubmit ? submit : undefined} className="relative flex min-h-0 flex-1 flex-col">
                        <div className={cn('min-h-0 flex-1 overflow-y-auto', flush ? 'border-t border-line' : 'px-6 pt-1 pb-6', bodyClassName)}>{children}</div>
                        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-sunken/50 px-6 py-4">{footer}</footer>}
                    </Shell>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

interface FormFooterProps {
    onCancel: () => void;
    loading?: boolean;
    submitLabel?: string;
    disabled?: boolean;
}

export function FormFooter({ onCancel, loading, submitLabel = 'Save', disabled }: FormFooterProps) {
    return (
        <>
            <Button variant="ghost" onClick={onCancel}>
                Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={disabled} className="min-w-28">
                {submitLabel}
            </Button>
        </>
    );
}

interface ConfirmProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    loading?: boolean;
    tone?: 'danger' | 'primary';
}

/** A short "are you sure?" — centred, with the two choices given equal weight. */
export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading, tone = 'danger' }: ConfirmProps) {
    const danger = tone === 'danger';

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[6px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
                <Dialog.Content
                    aria-describedby={undefined}
                    className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] bg-surface p-6 text-center shadow-[0_40px_80px_-24px_rgb(var(--shadow-color)/0.55)] outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop dark:ring-1 dark:ring-line-strong"
                >
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-40"
                        style={{ background: `radial-gradient(70% 100% at 50% 0%, color-mix(in srgb, var(${danger ? '--bad' : '--accent'}) ${danger ? 18 : 45}%, transparent), transparent 75%)` }}
                    />

                    <span className={cn('relative mx-auto grid size-14 place-items-center rounded-full ring-8', danger ? 'bg-bad text-white ring-bad-soft' : 'bg-inverse text-accent ring-brand-soft')}>
                        <TriangleAlert className="size-6" />
                    </span>

                    <Dialog.Title className="relative mt-5 text-[18px] leading-6 font-medium tracking-[-0.01em] text-ink">{title}</Dialog.Title>
                    <p className="relative mt-2 text-[13.5px] leading-relaxed text-ink-2">{message}</p>

                    <div className="relative mt-6 grid grid-cols-2 gap-2.5">
                        <Button size="lg" className="h-11 text-[14px]" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button size="lg" variant={tone} loading={loading} onClick={onConfirm} className="h-11 text-[14px]">
                            {confirmLabel}
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

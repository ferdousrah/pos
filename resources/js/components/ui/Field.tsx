import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const control =
    'w-full rounded-xl border border-line-strong bg-surface text-ink transition-[border-color,box-shadow] placeholder:text-ink-3 ' +
    'focus:border-ink focus:outline-none focus:ring-3 focus:ring-accent/60 disabled:bg-sunken disabled:text-ink-3';

const invalid = 'border-bad focus:border-bad focus:ring-bad/15';

interface FieldProps {
    label?: ReactNode;
    hint?: ReactNode;
    error?: string;
    optional?: boolean;
    className?: string;
    children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
    const id = useId();

    return (
        <div className={cn('min-w-0', className)}>
            {label && (
                <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-medium text-ink">
                    {label}
                    {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
                </label>
            )}
            {children(id)}
            {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-3">{hint}</p> : null}
        </div>
    );
}

type Shared = Pick<FieldProps, 'label' | 'hint' | 'error' | 'optional'> & { wrapperClassName?: string };

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'>, Shared {
    prefix?: ReactNode;
    suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, hint, error, optional, wrapperClassName, prefix, suffix, className, ...props },
    ref,
) {
    return (
        <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
            {(id) => (
                <div className="relative">
                    {prefix && (
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[13px] text-ink-3 [&_svg]:size-4">
                            {prefix}
                        </span>
                    )}
                    <input
                        ref={ref}
                        id={id}
                        className={cn(control, 'h-10 px-3.5', prefix && 'pl-8', suffix && 'pr-10', props.type === 'number' && 'num', error && invalid, className)}
                        {...props}
                    />
                    {suffix && (
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[13px] text-ink-3">{suffix}</span>
                    )}
                </div>
            )}
        </Field>
    );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Shared {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { label, hint, error, optional, wrapperClassName, className, children, ...props },
    ref,
) {
    return (
        <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
            {(id) => (
                <div className="relative">
                    <select ref={ref} id={id} className={cn(control, 'h-10 appearance-none truncate pr-8 pl-3.5', error && invalid, className)} {...props}>
                        {children}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3" />
                </div>
            )}
        </Field>
    );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Shared {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { label, hint, error, optional, wrapperClassName, className, rows = 3, ...props },
    ref,
) {
    return (
        <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
            {(id) => <textarea ref={ref} id={id} rows={rows} className={cn(control, 'resize-none px-3.5 py-2.5', error && invalid, className)} {...props} />}
        </Field>
    );
});

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
}

export function SearchInput({ value, onChange, placeholder = 'Search', className, autoFocus }: SearchInputProps) {
    return (
        <div className={cn('relative w-full sm:w-64', className)}>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input
                type="text"
                value={value}
                autoFocus={autoFocus}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(control, 'h-10 rounded-full pr-8 pl-9')}
            />
            {value && (
                <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => onChange('')}
                    className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-sunken hover:text-ink"
                >
                    <X className="size-3.5" />
                </button>
            )}
        </div>
    );
}

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
    return (
        <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
                    checked ? 'bg-ink' : 'bg-line-strong',
                )}
            >
                <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full shadow transition-[transform,translate,scale,rotate,background-color]', checked ? 'bg-accent' : 'bg-white', checked && 'translate-x-4')} />
            </button>
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{label}</span>
                {description && <span className="mt-0.5 block text-xs text-ink-3">{description}</span>}
            </span>
        </label>
    );
}

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: ReactNode;
    disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
    return (
        <label className={cn('flex cursor-pointer items-center gap-2.5 text-[13px] text-ink', disabled && 'cursor-not-allowed opacity-60')}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="size-4 shrink-0 rounded border-line-strong accent-(--brand)"
            />
            {label}
        </label>
    );
}

interface SegmentedProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: ReactNode }[];
    className?: string;
    size?: 'sm' | 'md';
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: SegmentedProps<T>) {
    return (
        <div className={cn('inline-flex rounded-full bg-sunken p-1', className)}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'flex-1 rounded-full px-3.5 font-medium whitespace-nowrap transition-colors',
                        size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
                        value === option.value ? 'bg-inverse text-on-inverse' : 'text-ink-2 hover:text-ink',
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

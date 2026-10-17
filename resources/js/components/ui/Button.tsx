import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

const variants = {
    primary: 'bg-brand text-on-brand hover:bg-brand-strong',
    accent: 'bg-accent text-on-accent hover:bg-accent-strong',
    secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
    ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
    danger: 'bg-bad text-white hover:brightness-95',
    subtle: 'bg-brand-soft text-brand hover:brightness-[0.97] dark:text-brand-strong',
};

const sizes = {
    sm: 'h-8 gap-1.5 rounded-full px-3 text-[13px]',
    md: 'h-10 gap-2 rounded-full px-4 text-[13.5px]',
    lg: 'h-13 gap-2.5 rounded-full px-6 text-[15px]',
    icon: 'size-9 rounded-full',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: keyof typeof variants;
    size?: keyof typeof sizes;
    loading?: boolean;
    icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...props },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            className={cn(
                'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,transform,translate,scale,rotate] duration-500 ease-smooth select-none',
                'active:scale-[0.97] [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:scale-110',
                'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
                variants[variant],
                sizes[size],
                className,
            )}
            {...props}
        >
            {loading ? <Spinner /> : icon}
            {children}
        </button>
    );
});

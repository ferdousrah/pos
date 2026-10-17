import { cn } from '@/lib/cn';

export function Logo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden>
            <rect width="32" height="32" rx="16" fill="#15170f" />
            <path d="M11.5 9v14M11.5 16l7.5-7M14 13.8 21 23" stroke="#e3ec78" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

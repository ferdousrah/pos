import { cn } from '@/lib/cn';

/**
 * The banner backdrop: a sky with sweeping glass-like ribbons, drawn in SVG so
 * it stays sharp at any width and needs no image asset.
 */
export function HeroArt({ className }: { className?: string }) {
    return (
        <svg className={cn('absolute inset-0 size-full', className)} viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
                <linearGradient id="hero-sky" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#3f8f93" />
                    <stop offset="0.55" stopColor="#5fb0ad" />
                    <stop offset="1" stopColor="#a9d9cf" />
                </linearGradient>
                <linearGradient id="hero-band-a" x1="0" y1="0" x2="1" y2="0.6">
                    <stop offset="0" stopColor="#0f6f72" />
                    <stop offset="1" stopColor="#4fb5ad" />
                </linearGradient>
                <linearGradient id="hero-band-b" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#1d8b8a" />
                    <stop offset="1" stopColor="#8fd8cc" />
                </linearGradient>
                <linearGradient id="hero-band-c" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0b5559" />
                    <stop offset="1" stopColor="#2a9a98" />
                </linearGradient>
                <radialGradient id="hero-glow" cx="0.2" cy="0.1" r="0.7">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
            </defs>

            <rect width="1200" height="420" fill="url(#hero-sky)" />
            <rect width="1200" height="420" fill="url(#hero-glow)" />

            {/* Soft clouds */}
            <g fill="#ffffff" opacity="0.16">
                <ellipse cx="230" cy="120" rx="210" ry="38" />
                <ellipse cx="420" cy="80" rx="150" ry="26" />
                <ellipse cx="90" cy="210" rx="170" ry="30" />
            </g>

            {/* Ribbons */}
            <path d="M520 420 C640 250 820 150 1200 120 L1200 420 Z" fill="url(#hero-band-c)" />
            <path d="M610 420 C720 290 900 215 1200 200 L1200 420 Z" fill="url(#hero-band-a)" />
            <path d="M720 420 C810 330 960 285 1200 280 L1200 420 Z" fill="url(#hero-band-b)" />
            <path d="M860 420 C930 372 1040 350 1200 352 L1200 420 Z" fill="#0c5d60" opacity="0.85" />

            {/* Glazing lines following the curves */}
            <g fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.2">
                <path d="M540 420 C660 262 830 168 1200 138" />
                <path d="M566 420 C680 276 850 186 1200 158" />
                <path d="M590 420 C702 286 880 202 1200 180" />
                <path d="M640 420 C746 302 920 232 1200 218" />
                <path d="M680 420 C778 318 944 254 1200 244" />
                <path d="M760 420 C846 342 980 300 1200 296" />
                <path d="M806 420 C884 356 1010 322 1200 320" />
            </g>
            <g stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1">
                {Array.from({ length: 16 }, (_, i) => (
                    <line key={i} x1={700 + i * 34} y1={420} x2={760 + i * 34} y2={140 + i * 6} />
                ))}
            </g>
        </svg>
    );
}

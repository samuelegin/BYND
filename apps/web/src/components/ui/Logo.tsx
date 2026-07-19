import { useId } from 'react';
import { clsx } from 'clsx';

interface LogoProps {
  className?: string;
  markSize?: number;
}

export function Logo({ className = '', markSize = 25 }: LogoProps) {
  const gradId = useId();
  const height = markSize * (128 / 84);

  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <svg width={markSize} height={height} viewBox="108 42 84 128" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="150" y1="165" x2="150" y2="46">
            <stop offset="0" stopColor="#B78A3F" />
            <stop offset=".45" stopColor="#E5B567" />
            <stop offset="1" stopColor="#F0C983" />
          </linearGradient>
        </defs>
        <g fill="none" stroke={`url(#${gradId})`} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round">
          <path d="M150,165 L150,92" />
          <path d="M150,92 L122,50" />
          <path d="M150,92 L178,50" />
        </g>
        <circle cx="122" cy="50" r="7.5" fill="#F0C983" />
        <circle cx="178" cy="50" r="7.5" fill="#F0C983" />
      </svg>
      <span className="font-display text-[21px] font-semibold tracking-[-.01em] text-white/[.87]">
        bynd
      </span>
    </span>
  );
}

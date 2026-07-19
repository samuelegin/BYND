import { clsx } from 'clsx';
import byndLogo from '../../../assets/bynd-logo.svg?raw';
import byndMark from '../../../assets/bynd-mark.svg?raw';

interface LogoProps {
  className?: string;
  /** Icon-only fork mark, no wordmark — for tight spaces. */
  markOnly?: boolean;
  /** Rendered height in px; width follows the asset's intrinsic aspect ratio. */
  height?: number;
}

export function Logo({ className = '', markOnly = false, height = 28 }: LogoProps) {
  const svg = markOnly ? byndMark : byndLogo;

  return (
    <span
      className={clsx('inline-flex text-white/[.87] [&>svg]:h-full [&>svg]:w-auto', className)}
      style={{ height }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

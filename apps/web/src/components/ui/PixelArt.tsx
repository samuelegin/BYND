import { clsx } from "clsx";

interface PixelArtProps {
  /** Imported .webp asset (Vite resolves this to a hashed, cache-friendly URL). */
  webp: string;
  /** Imported .png asset — fallback for browsers/agents without WebP support. */
  png: string;
  /** Intrinsic width in px. Required — prevents layout shift while the image loads. */
  width: number;
  /** Intrinsic height in px. Required — prevents layout shift while the image loads. */
  height: number;
  /**
   * Meaningful description for assistive tech. Pass "" (empty string) for
   * purely decorative art so screen readers skip it — never omit this prop.
   */
  alt: string;
  className?: string;
  /**
   * Set true only for the single above-the-fold hero illustration. Skips
   * lazy-loading and hints the browser to fetch it at high priority.
   */
  priority?: boolean;
}

/**
 * Pixel-art illustration primitive used across the landing page.
 * - <picture> serves WebP with a PNG fallback.
 * - width/height are always set so the browser reserves layout space (no CLS).
 * - Lazy-loads by default; only `priority` images (the hero mascot) load eagerly.
 */
export function PixelArt({
  webp,
  png,
  width,
  height,
  alt,
  className,
  priority = false,
}: PixelArtProps) {
  return (
    <picture>
      <source srcSet={webp} type="image/webp" />
      <img
        src={png}
        width={width}
        height={height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className={clsx("select-none", className)}
        draggable={false}
      />
    </picture>
  );
}

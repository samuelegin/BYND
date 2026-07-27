import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { PixelArt } from '@/components/ui';

import heroWaveWebp from '@/assets/illustrations/mascot/mascot-hero-wave.webp';
import heroWavePng from '@/assets/illustrations/mascot/mascot-hero-wave.png';
import buildWallWebp from '@/assets/illustrations/mascot/mascot-build-wall.webp';
import buildWallPng from '@/assets/illustrations/mascot/mascot-build-wall.png';
import flagPlantWebp from '@/assets/illustrations/mascot/mascot-flag-plant.webp';
import flagPlantPng from '@/assets/illustrations/mascot/mascot-flag-plant.png';
import celebrateWebp from '@/assets/illustrations/mascot/mascot-celebrate.webp';
import celebratePng from '@/assets/illustrations/mascot/mascot-celebrate.png';
import sleepingWebp from '@/assets/illustrations/mascot/mascot-sleeping.webp';
import sleepingPng from '@/assets/illustrations/mascot/mascot-sleeping.png';

const SCAN_FRAMES = [
  { webp: heroWaveWebp, png: heroWavePng, alt: 'Mascot waving hello' },
  { webp: buildWallWebp, png: buildWallPng, alt: 'Mascot building a wall' },
  { webp: flagPlantWebp, png: flagPlantPng, alt: 'Mascot planting a flag' },
];

const FRAME_MS = 1200;

interface MascotScanCarouselProps {
  /** True while the wallet scan for veMEZO NFTs is still in flight. */
  isScanning: boolean;
  /** Resolved NFT count — only meaningful once isScanning is false. */
  foundCount: number;
  /**
   * Fires once, after the scan has resolved AND at least one full mascot
   * cycle has played AND the "Found" beat has held on screen — the parent
   * uses this to swap the carousel out for the NFT picker.
   */
  onComplete: () => void;
}

/**
 * Loading-state replacement for the old spinner: an auto-advancing mascot
 * carousel that always plays at least one full cycle (hero-wave →
 * build-wall → flag-plant) before it's allowed to resolve, so a fast scan
 * never feels like a flash. Once the scan resolves AND a full cycle has
 * played, it settles on the celebrate frame with a "Found" badge for a
 * beat, then hands off to the parent.
 */
export function MascotScanCarousel({ isScanning, foundCount, onComplete }: MascotScanCarouselProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [phase, setPhase] = useState<'cycling' | 'found' | 'empty'>('cycling');
  const cyclesCompleted = useRef(0);
  const scanDoneRef = useRef(false);
  const completedRef = useRef(false);

  scanDoneRef.current = !isScanning;

  // Advance the frame every FRAME_MS. Each time we wrap back to frame 0 we
  // count a completed cycle — once we've done >=1 full cycle AND the scan
  // has actually resolved, stop cycling and settle on the result frame.
  useEffect(() => {
    if (phase !== 'cycling') return;
    const id = setInterval(() => {
      setFrameIndex(prev => {
        const next = (prev + 1) % SCAN_FRAMES.length;
        if (next === 0) {
          cyclesCompleted.current += 1;
          if (cyclesCompleted.current >= 1 && scanDoneRef.current) {
            setPhase(foundCount > 0 ? 'found' : 'empty');
          }
        }
        return next;
      });
    }, FRAME_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Hold on the result frame for a beat, then hand off to the parent.
  useEffect(() => {
    if (phase === 'cycling' || completedRef.current) return;
    const id = setTimeout(() => {
      completedRef.current = true;
      onComplete();
    }, FRAME_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const resultFrame = phase === 'found'
    ? { webp: celebrateWebp, png: celebratePng, alt: 'Mascot celebrating' }
    : { webp: sleepingWebp, png: sleepingPng, alt: 'Mascot sleeping, nothing found' };

  const frame = phase === 'cycling' ? SCAN_FRAMES[frameIndex] : resultFrame;

  return (
    <div className="rounded-control border border-void-border p-6 flex flex-col items-center justify-center gap-3 min-h-[168px]">
      <div className="relative h-[72px] w-[72px] flex items-center justify-center">
        <PixelArt
          key={frame.alt}
          webp={frame.webp}
          png={frame.png}
          width={72}
          height={72}
          alt={frame.alt}
          className="h-[72px] w-auto object-contain animate-fade-in"
        />
      </div>

      <p className="font-mono text-[11px] uppercase tracking-widest text-white/60">
        {phase === 'cycling' && 'Scanning wallet for veMEZO NFTs…'}
        {phase === 'found' && `Found ${foundCount} veMEZO NFT${foundCount === 1 ? '' : 's'}`}
        {phase === 'empty' && 'No veMEZO NFTs found'}
      </p>

      {/* Progress dots — one per scan frame, filled once passed, so the
          carousel doesn't feel like it's stuck even before the scan resolves. */}
      {phase === 'cycling' && (
        <div className="flex items-center gap-1.5">
          {SCAN_FRAMES.map((f, i) => (
            <span
              key={f.alt}
              className={clsx(
                'h-1.5 w-1.5 rounded-full transition-colors',
                i === frameIndex ? 'bg-gold' : 'bg-white/[.16]',
              )}
            />
          ))}
        </div>
      )}
      {phase === 'found' && (
        <span className="font-mono text-[10px] uppercase tracking-widest rounded-full border border-gold/30 bg-gold/10 text-gold px-2.5 py-1">
          Found
        </span>
      )}
    </div>
  );
}

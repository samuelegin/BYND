import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowRight, Lock, FileText, Clock, Sparkles } from 'lucide-react';
import { Panel, Button, Badge, PixelArt } from '@/components/ui';
import { LockMintConfirmModal } from '@/components/modals';
import type { ProtocolStats, UserPosition } from '@/types';
import { MascotScanCarousel } from './MascotScanCarousel';

import forgeSceneWebp from '@/assets/illustrations/sections/scene-forge-vebynd.webp';
import forgeScenePng from '@/assets/illustrations/sections/scene-forge-vebynd.png';
import yKeyWebp from '@/assets/illustrations/icons/icon-y-key.webp';
import yKeyPng from '@/assets/illustrations/icons/icon-y-key.png';
import coinWebp from '@/assets/illustrations/icons/icon-vebynd-coin.webp';
import coinPng from '@/assets/illustrations/icons/icon-vebynd-coin.png';
import { mascotForToken } from '@/lib/mascotAvatars';

interface LockAndMintProps {
  position: UserPosition;
  stats: ProtocolStats;
  isScanning: boolean;
  isLoading: boolean;
  onDeposit: (tokenId: number) => Promise<void>;
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onExtendLock: (tokenId: number) => Promise<void>;
}

// Deterministic per-tokenId gradient so each NFT tile gets a distinct,
// consistent visual anchor without needing real per-token art assets.
const tileGradient = (id: number) => {
  const hue = (id * 47) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 22%), hsl(${(hue + 40) % 360} 60% 12%))`;
};

export function LockAndMint({
  position, stats, isScanning, isLoading, onDeposit, onUnlockPermanent, onExtendLock,
}: LockAndMintProps) {
  const { veMezoTokenIds, lockedAmounts, permanentIds, expiredIds } = position;
  const [selected, setSelected] = useState<number | null>(null);
  const [carouselDone, setCarouselDone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Default to the first eligible (non-blocked) NFT once the wallet scan
  // resolves, so the select lands on a ready-to-submit token instead of
  // an empty option.
  useEffect(() => {
    if (selected !== null && veMezoTokenIds.includes(selected)) return;
    const firstEligible = veMezoTokenIds.find(
      id => !permanentIds.includes(id) && !expiredIds.includes(id),
    );
    setSelected(firstEligible ?? veMezoTokenIds[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veMezoTokenIds.join(',')]);

  // Reset the carousel whenever a fresh scan kicks off (e.g. wallet switch).
  useEffect(() => {
    if (isScanning) setCarouselDone(false);
  }, [isScanning]);

  const isPermanent = selected !== null && permanentIds.includes(selected);
  const isExpired = selected !== null && expiredIds.includes(selected);
  const selectedAmount = selected !== null ? lockedAmounts[selected] : undefined;
  const netReceive = selectedAmount
    ? parseFloat(selectedAmount) * (1 - stats.protocolFeeBps / 10000)
    : null;

  const showCarousel = isScanning || !carouselDone;
  const hasNfts = veMezoTokenIds.length > 0;

  return (
    <Panel className="relative overflow-hidden p-6 flex flex-col h-full">
      {/* Ambient forge scene — echoes the "forge veBYND" identity, sits
          low-opacity behind the content so the card doesn't read as an
          empty form even before any numbers are filled in. */}
      <PixelArt
        webp={forgeSceneWebp}
        png={forgeScenePng}
        width={300}
        height={262}
        alt=""
        className="pointer-events-none select-none absolute -bottom-6 -right-8 h-[220px] w-auto object-contain opacity-[.07] mix-blend-luminosity"
      />

      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-gold mb-1">
            Step 01 · Lock &amp; Mint
          </p>
          <p className="text-sm text-white/60">
            208-week lock, no withdrawal · mints liquid veBYND 1:1
          </p>
        </div>
        <Badge variant={hasNfts ? 'acid' : 'muted'}>
          {isScanning ? 'Scanning…' : hasNfts ? `${veMezoTokenIds.length} eligible` : 'No NFTs'}
        </Badge>
      </div>

      {/* Loading state — mascot carousel instead of a spinner. Always
          plays at least one full cycle before it's allowed to settle, so
          a fast scan never flashes past the "found" beat. */}
      <div className={clsx('relative mb-4', showCarousel && 'flex-1 flex flex-col min-h-0')}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38] mb-2">
          Select veMEZO NFT
        </p>
        {showCarousel ? (
          <MascotScanCarousel
            isScanning={isScanning}
            foundCount={veMezoTokenIds.length}
            onComplete={() => setCarouselDone(true)}
            className="flex-1"
          />
        ) : !hasNfts ? (
          <div className="rounded-control border border-void-border p-4 text-center">
            <p className="text-sm text-white/60">No veMEZO NFTs found in wallet</p>
          </div>
        ) : (
          <div className="relative">
            <select
              value={selected ?? ''}
              onChange={e => setSelected(Number(e.target.value))}
              className="w-full appearance-none rounded-control border border-void-border bg-bg text-white/[.87] font-mono text-sm px-4 py-3 pr-9 outline-none focus:border-gold/50 transition-colors cursor-pointer"
            >
              {veMezoTokenIds.map(id => {
                const blocked = permanentIds.includes(id) || expiredIds.includes(id);
                const amount = lockedAmounts[id];
                const label = amount
                  ? `veMEZO #${id} · ${parseFloat(amount).toLocaleString()} MEZO`
                  : `veMEZO #${id}`;
                const suffix = permanentIds.includes(id)
                  ? ' (permanently locked)'
                  : expiredIds.includes(id)
                    ? ' (lock expired)'
                    : '';
                return (
                  <option key={id} value={id} className="bg-void-soft text-white/[.87]">
                    {blocked ? `⚠ ${label}${suffix}` : label}
                  </option>
                );
              })}
            </select>
            <ArrowRight
              size={14}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-white/[.38]"
            />
          </div>
        )}
      </div>

      {!showCarousel && hasNfts && selected !== null && (
        <>
          {/* Selected-NFT identity strip — the same gradient tile shows up
              again in the confirm modal, so the token reads as the same
              object across both surfaces instead of resetting the user's
              mental model. */}
          <div className="relative mb-4 flex items-center gap-3 rounded-control border border-void-border bg-bg p-3">
            <div
              className="h-11 w-11 shrink-0 rounded-md border border-white/[.06] flex items-center justify-center overflow-hidden"
              style={{ background: tileGradient(selected) }}
            >
              <PixelArt
                {...mascotForToken(selected)}
                className="h-9 w-auto object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-medium text-white/[.87]">veMEZO #{selected}</p>
              <p className="text-xs text-white/[.38]">
                {selectedAmount ? `${parseFloat(selectedAmount).toLocaleString()} MEZO locked` : 'Loading…'}
              </p>
            </div>
          </div>

          {/* Inline stat strip — same numbers the confirm modal shows, so
              the decision is fully informed before the user even opens
              it, instead of the card feeling like an empty waiting room. */}
          <div className="relative mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-control border border-void-border bg-bg p-3 flex flex-col gap-1.5">
              <FileText size={13} className="text-white/[.38]" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/[.38]">Voting power</span>
              <span className="font-mono text-xs font-medium text-white/[.87] truncate">
                {selectedAmount ? `${parseFloat(selectedAmount).toLocaleString()}` : '–'}
              </span>
            </div>
            <div className="rounded-control border border-void-border bg-bg p-3 flex flex-col gap-1.5">
              <PixelArt webp={yKeyWebp} png={yKeyPng} width={73} height={110} alt="" className="h-3.5 w-auto object-contain opacity-70" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/[.38]">Mint rate</span>
              <span className="font-mono text-xs font-medium text-gold">1:1</span>
            </div>
            <div className="rounded-control border border-void-border bg-bg p-3 flex flex-col gap-1.5">
              <Clock size={13} className="text-white/[.38]" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/[.38]">Lock</span>
              <span className="font-mono text-xs font-medium text-white/[.87]">208 weeks</span>
            </div>
          </div>
        </>
      )}

      {/* Blocked-state warnings — inline, immediate feedback before the
          user opens the confirm modal. */}
      {!showCarousel && isPermanent && (
        <div className="relative mb-4 rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-white/60 leading-relaxed">
            <span className="text-yellow-300 font-medium">veMEZO #{selected} is permanently locked.</span>{' '}
            Resolve this in the confirm step before locking.
          </p>
        </div>
      )}
      {!showCarousel && isExpired && (
        <div className="relative mb-4 rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-white/60 leading-relaxed">
            <span className="text-yellow-300 font-medium">veMEZO #{selected}&rsquo;s lock has expired.</span>{' '}
            Withdraw and re-lock on Mezo&rsquo;s app, then deposit the fresh NFT here.
          </p>
        </div>
      )}

      {/* Hero "you receive" card — subtle gold glow to make the headline
          number feel alive rather than a static label/value pair. */}
      {!showCarousel && hasNfts && (
        <div className="relative mb-5 rounded-control border border-gold/20 bg-gradient-to-br from-gold/[.07] to-transparent p-4 flex items-center justify-between motion-safe:animate-glow-pulse">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] flex items-center gap-1.5">
            <Sparkles size={12} className="text-gold" /> You receive
          </span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-gold leading-none">
              {netReceive !== null ? netReceive.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '–'}
            </span>
            <PixelArt webp={coinWebp} png={coinPng} width={100} height={110} alt="" className="h-6 w-auto object-contain" />
          </div>
        </div>
      )}

      <div className="relative mt-auto">
        <Button
          variant="primary"
          fullWidth
          onClick={() => setConfirmOpen(true)}
          disabled={selected === null || showCarousel || isLoading}
        >
          <Lock size={14} /> Lock &amp; Mint veBYND <ArrowRight size={14} />
        </Button>
      </div>

      {selected !== null && (
        <LockMintConfirmModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          tokenId={selected}
          lockedAmount={selectedAmount}
          isPermanent={isPermanent}
          isExpired={isExpired}
          protocolFeeBps={stats.protocolFeeBps}
          onUnlockPermanent={onUnlockPermanent}
          onDeposit={onDeposit}
        />
      )}
    </Panel>
  );
}

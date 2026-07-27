import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import { Panel, Button, Badge } from '@/components/ui';
import { LockMintConfirmModal } from '@/components/modals';
import type { ProtocolStats, UserPosition } from '@/types';
import { MascotScanCarousel } from './MascotScanCarousel';

interface LockAndMintProps {
  position: UserPosition;
  stats: ProtocolStats;
  isScanning: boolean;
  isLoading: boolean;
  onDeposit: (tokenId: number) => Promise<void>;
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onExtendLock: (tokenId: number) => Promise<void>;
}

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
  const isBlocked = isPermanent || isExpired;
  const selectedAmount = selected !== null ? lockedAmounts[selected] : undefined;

  const showCarousel = isScanning || !carouselDone;

  return (
    <Panel className="p-6 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-gold mb-1">
            Step 01 · Lock &amp; Mint
          </p>
          <p className="text-sm text-white/60">
            Permanent 4-year lock · mints liquid veBYND 1:1
          </p>
        </div>
        <Badge variant={veMezoTokenIds.length > 0 ? 'acid' : 'muted'}>
          {isScanning ? 'Scanning…' : veMezoTokenIds.length > 0 ? `${veMezoTokenIds.length} eligible` : 'No NFTs'}
        </Badge>
      </div>

      {/* Loading state — mascot carousel instead of a spinner. Always plays
          at least one full cycle before it's allowed to settle, so a fast
          scan never flashes past the "found" beat. */}
      <div className="mb-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38] mb-2">
          Select veMEZO NFT
        </p>
        {showCarousel ? (
          <MascotScanCarousel
            isScanning={isScanning}
            foundCount={veMezoTokenIds.length}
            onComplete={() => setCarouselDone(true)}
          />
        ) : veMezoTokenIds.length === 0 ? (
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

      {/* Blocked-state warnings — inline, one-click resolution, shown
          before the user even opens the confirm modal. */}
      {!showCarousel && isPermanent && (
        <div className="mb-5 rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-white/60 leading-relaxed">
            <span className="text-yellow-300 font-medium">veMEZO #{selected} is permanently locked.</span>{' '}
            Resolve this in the confirm step before locking.
          </p>
        </div>
      )}
      {!showCarousel && isExpired && (
        <div className="mb-5 rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-white/60 leading-relaxed">
            <span className="text-yellow-300 font-medium">veMEZO #{selected}&rsquo;s lock has expired.</span>{' '}
            Withdraw and re-lock on Mezo&rsquo;s app, then deposit the fresh NFT here.
          </p>
        </div>
      )}

      {/* Compact summary — full breakdown now lives in the confirm modal. */}
      {!showCarousel && veMezoTokenIds.length > 0 && (
        <div className="rounded-control border border-void-border bg-bg p-4 flex items-center justify-between mb-5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            You receive
          </span>
          <span className="text-xl font-semibold text-gold leading-none">
            {selectedAmount
              ? `${(parseFloat(selectedAmount) * (1 - stats.protocolFeeBps / 10000)).toLocaleString(undefined, { maximumFractionDigits: 2 })} veBYND`
              : '–'}
          </span>
        </div>
      )}

      <div className="mt-auto">
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

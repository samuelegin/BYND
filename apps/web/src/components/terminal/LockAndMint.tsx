import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Lock, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, Button, Badge } from '@/components/ui';
import type { ProtocolStats, TxStatus, UserPosition } from '@/types';

interface LockAndMintProps {
  position: UserPosition;
  stats: ProtocolStats;
  isScanning: boolean;
  isLoading: boolean;
  onDeposit: (tokenId: number) => Promise<void>;
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onExtendLock: (tokenId: number) => Promise<void>;
}

// Deterministic per-tokenId gradient so each NFT chip gets a distinct,
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
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  // Default to the first eligible (non-blocked) NFT once the wallet scan
  // resolves, so the user lands on a ready-to-submit transaction instead of
  // an empty selector.
  useEffect(() => {
    if (selected !== null && veMezoTokenIds.includes(selected)) return;
    const firstEligible = veMezoTokenIds.find(
      id => !permanentIds.includes(id) && !expiredIds.includes(id),
    );
    setSelected(firstEligible ?? veMezoTokenIds[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veMezoTokenIds.join(',')]);

  const netReceive = (lockedAmount: string) =>
    parseFloat(lockedAmount) * (1 - stats.protocolFeeBps / 10000);

  const isPermanent = selected !== null && permanentIds.includes(selected);
  const isExpired = selected !== null && expiredIds.includes(selected);
  const isBlocked = isPermanent || isExpired;
  const selectedAmount = selected !== null ? lockedAmounts[selected] : undefined;

  const handleLockAndMint = async () => {
    if (selected === null) return;
    setStatus({ type: 'loading', message: 'Locking veMEZO NFT…' });
    try {
      await onDeposit(selected);
      setStatus({ type: 'success', message: 'Locked. veBYND minted 1:1' });
      setTimeout(() => setStatus({ type: null, message: null }), 2500);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Deposit failed' });
    }
  };

  const handleUnlock = async () => {
    if (selected === null) return;
    setStatus({ type: 'loading', message: 'Converting to time-based lock…' });
    try {
      await onUnlockPermanent(selected);
      setStatus({ type: 'success', message: 'Done. You can now lock and mint.' });
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Unlock failed' });
    }
  };

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

      {/* NFT selector — horizontal, compact, clickable chips instead of a
          single decorative card. */}
      <div className="mb-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38] mb-2">
          Select veMEZO NFT
        </p>
        {isScanning ? (
          <div className="rounded-control border border-void-border p-4 flex items-center gap-3">
            <Loader2 size={16} className="text-gold animate-spin shrink-0" />
            <p className="text-sm text-white/60">Reading veMEZO NFTs from Matsnet…</p>
          </div>
        ) : veMezoTokenIds.length === 0 ? (
          <div className="rounded-control border border-void-border p-4 text-center">
            <p className="text-sm text-white/60">No veMEZO NFTs found in wallet</p>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {veMezoTokenIds.map(id => {
              const blocked = permanentIds.includes(id) || expiredIds.includes(id);
              const active = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={clsx(
                    'shrink-0 flex items-center gap-2 rounded-control border px-3 py-2 transition-colors text-left',
                    active ? 'border-gold/50 bg-gold/5' : blocked ? 'border-yellow-400/20' : 'border-void-border hover:border-white/[.12]',
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-md shrink-0 border border-white/[.06]"
                    style={{ background: tileGradient(id) }}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-white/[.87] whitespace-nowrap">
                      veMEZO #{id}
                    </p>
                    <p className="text-[10px] text-white/[.38] whitespace-nowrap">
                      {lockedAmounts[id] ? `${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO` : '…'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Blocked-state warnings — inline, one-click resolution */}
      {isPermanent && (
        <div className="mb-5 rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 space-y-2">
          <div className="flex gap-2">
            <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-white/60 leading-relaxed">
              <span className="text-yellow-300 font-medium">veMEZO #{selected} is permanently locked.</span>{' '}
              Convert to a time-based lock once — the vault re-locks it to 4 years automatically on deposit.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            fullWidth
            className="border-yellow-400/30 text-yellow-300 hover:bg-yellow-400/10"
            onClick={handleUnlock}
            isLoading={status.type === 'loading'}
          >
            Unlock permanent lock
          </Button>
        </div>
      )}
      {isExpired && (
        <div className="mb-5 rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-white/60 leading-relaxed">
            <span className="text-yellow-300 font-medium">veMEZO #{selected}&rsquo;s lock has expired.</span>{' '}
            Withdraw and re-lock on Mezo&rsquo;s app, then deposit the fresh NFT here.
          </p>
        </div>
      )}

      {/* Transaction summary — four-level hierarchy: large number for the
          headline "receive" value, medium for row labels, small/tiny for
          supporting detail. */}
      <div className="rounded-control border border-void-border bg-bg p-4 space-y-3 mb-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            Voting power
          </span>
          <span className="font-mono text-sm font-medium text-white/[.87]">
            {selectedAmount ? `${parseFloat(selectedAmount).toLocaleString()} veMEZO` : '–'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            Mint rate
          </span>
          <span className="font-mono text-sm font-medium text-gold">1:1 veBYND</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            Lock duration
          </span>
          <span className="font-mono text-sm font-medium text-white/[.87]">4 years (max)</span>
        </div>
        <div className="pt-3 border-t border-void-border flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            You receive
          </span>
          <span className="text-xl font-semibold text-gold leading-none">
            {selectedAmount ? `${netReceive(selectedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} veBYND` : '–'}
          </span>
        </div>
      </div>

      {status.message && (
        <p className={clsx(
          'text-xs mb-3 leading-relaxed',
          status.type === 'error' ? 'text-red-400' : status.type === 'success' ? 'text-gold' : 'text-white/60',
        )}>
          {status.message}
        </p>
      )}

      <div className="mt-auto">
        <Button
          variant="primary"
          fullWidth
          onClick={handleLockAndMint}
          disabled={selected === null || isBlocked || isLoading}
          isLoading={status.type === 'loading'}
        >
          <Lock size={14} /> Lock &amp; Mint veBYND <ArrowRight size={14} />
        </Button>
      </div>
    </Panel>
  );
}

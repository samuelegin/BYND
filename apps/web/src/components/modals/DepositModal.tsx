'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, Lock, ChevronDown, FileText, Clock, Percent } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, StatRow } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenIds: number[];
  lockedAmounts?: Record<number, string>;
  permanentIds?: number[];   // token IDs with isPermanent=true — vault cannot accept these as-is
  expiredIds?: number[];     // token IDs whose lock has already ended — vault requires end > now unless permanent
  protocolFeeBps?: number;   // governance-set, 0 if never configured on-chain
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onExtendLock: (tokenId: number) => Promise<void>;
  onDeposit: (tokenId: number) => Promise<void>;
}

// Deterministic per-tokenId gradient so each NFT row gets a distinct,
// consistent illustration tile without needing real per-token art assets.
const tileGradient = (id: number) => {
  const hue = (id * 47) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 22%), hsl(${(hue + 40) % 360} 60% 12%))`;
};

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, tokenIds, lockedAmounts = {}, permanentIds = [], expiredIds = [], protocolFeeBps = 0, onUnlockPermanent, onExtendLock, onDeposit }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus]     = useState<TxStatus>({ type: null, message: null });
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  // Tracks whether the scrollable list has content below the fold, so we
  // only show the "scroll for more" hint when it's actually true — and hide
  // it once the user has scrolled to the bottom. This is the fix for the
  // original problem: no cue existed telling users more content was below.
  const checkScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setHasMoreBelow(remaining > 8);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, tokenIds.length]);

  const handleDeposit = async () => {
    if (selected === null) return;
    setStatus({ type: 'loading', message: 'Locking veMEZO NFT…' });
    try {
      await onDeposit(selected);
      setStatus({ type: 'success', message: 'Locked. veBYND minted 1:1' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Deposit failed' });
    }
  };

  const displayIds = tokenIds; // real token IDs only — no mock fallback

  // veBYND minted 1:1 per MEZO locked, minus the governance-set protocol
  // fee (0 unless governance has configured one on-chain).
  const netReceive = (lockedAmount: string) =>
    parseFloat(lockedAmount) * (1 - protocolFeeBps / 10000);

  const selectedIsBlocked = selected !== null && (permanentIds.includes(selected) || expiredIds.includes(selected));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lock and mint veBYND"
      subtitle="Permanent · one-way · non-reversible"
      size="xl"
      footer={
        <div className="space-y-3">
          <TxBlock status={status} />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/[.38] flex-1">
              <Lock size={12} className="shrink-0" />
              <span>This action is <span className="text-gold">permanent</span> and cannot be undone.</span>
            </div>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleDeposit}
              disabled={selected === null || selectedIsBlocked}
              isLoading={status.type === 'loading'}
            >
              Lock and mint veBYND
            </Button>
          </div>
        </div>
      }
    >
      {/* Scrollable middle section — everything except the sticky footer above */}
      <div ref={listRef} onScroll={checkScroll} className="space-y-5 -mx-6 px-6 -mt-2 pt-2 max-h-[52vh] overflow-y-auto">
        {/* Permanent lock warning — static info */}
        <div className="rounded-control p-3 border border-gold/20 bg-gold/5 flex gap-2">
          <Lock size={14} className="text-gold shrink-0 mt-0.5" />
          <p className="text-sm text-white/60 leading-relaxed">
            Lock a veMEZO NFT to mint <span className="text-white/[.87] font-medium">veBYND</span>, a liquid
            receipt token, 1:1. This lock is <span className="text-gold font-medium">permanent</span> and
            cannot be undone. To exit, trade veBYND on the veBYND/MEZO pool on secondary markets.
          </p>
        </div>

        {/* Per-token warning + one-click unlock when a permanently locked NFT is selected */}
        {selected !== null && permanentIds.includes(selected) && (
          <div className="rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 space-y-2">
            <div className="flex gap-2">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-yellow-300 font-medium">
                  veMEZO #{selected} is permanently locked
                </p>
                <p className="text-xs text-white/60 leading-relaxed">
                  The vault requires a time-based lock. Click below to convert it. This is a one-time
                  wallet transaction. The vault will immediately re-lock it to 208 weeks on your first deposit.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              fullWidth
              className="border-yellow-400/30 text-yellow-300 hover:bg-yellow-400/10"
              onClick={async () => {
                setStatus({ type: 'loading', message: 'Converting to time-based lock…' });
                try {
                  await onUnlockPermanent(selected);
                  setStatus({ type: 'success', message: 'Done. You can now deposit. Click Lock and mint.' });
                } catch (e: any) {
                  setStatus({ type: 'error', message: e.message || 'Unlock failed' });
                }
              }}
              isLoading={status.type === 'loading'}
            >
              Unlock permanent lock
            </Button>
          </div>
        )}

        {/* Per-token warning when an EXPIRED lock is selected. Extending only
            works on a still-active lock — an already-expired one must be
            withdrawn and re-locked fresh via Mezo's own app, so this points
            there rather than offering a doomed "extend" action. */}
        {selected !== null && expiredIds.includes(selected) && (
          <div className="rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 space-y-2">
            <div className="flex gap-2">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-yellow-300 font-medium">
                  veMEZO #{selected}&rsquo;s lock has expired
                </p>
                <p className="text-xs text-white/60 leading-relaxed">
                  Expired locks can&rsquo;t be extended directly. Withdraw it on Mezo&rsquo;s app to reclaim
                  the underlying MEZO, then create a fresh lock and deposit the new NFT here.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Section 1 — NFT picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[.14em] text-gold">
              1. Select an eligible NFT
            </p>
            <span className="font-mono text-[11px] text-white/[.38] rounded-full border border-void-border px-2 py-0.5">
              {displayIds.length} eligible
            </span>
          </div>

          <div className="space-y-2">
            {displayIds.length === 0 ? (
              <div className="rounded-control p-6 border border-void-border text-center">
                <p className="text-sm text-white/60">No veMEZO NFTs in wallet</p>
              </div>
            ) : displayIds.map(id => {
              const isExpired = expiredIds.includes(id);
              const isPermanent = permanentIds.includes(id);
              const isBlocked = isExpired || isPermanent;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={clsx(
                    'w-full flex items-center gap-3 rounded-control p-3 border transition-all duration-200 text-left',
                    selected === id ? 'border-gold/50 bg-gold/5' : isBlocked ? 'border-yellow-400/20' : 'border-void-border hover:border-white/[.12]'
                  )}
                >
                  {/* Illustration tile — deterministic per tokenId, on-brand
                      gradient rather than literal art (no per-NFT image
                      assets exist), but gives each row a distinct visual
                      anchor the way the reference mockup's art did. */}
                  <div
                    className="w-12 h-12 rounded-md shrink-0 flex items-center justify-center border border-white/[.06] overflow-hidden"
                    style={{ background: tileGradient(id) }}
                  >
                    <Lock size={16} className="text-white/40" strokeWidth={1.5} />
                  </div>

                  <div className={clsx(
                    'w-4 h-4 rounded-full border transition-colors shrink-0',
                    selected === id ? 'border-gold bg-gold' : 'border-white/[.38]'
                  )} />

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white/[.87]">veMEZO #{id}</span>
                    <p className={clsx('text-xs', isExpired ? 'text-yellow-400' : isPermanent ? 'text-yellow-400' : 'text-white/60')}>
                      {!lockedAmounts[id]
                        ? 'Loading…'
                        : isExpired
                          ? `~${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO · lock expired`
                          : isPermanent
                            ? `~${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO · permanently locked`
                            : `~${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO locked · extended to 4yr`}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs font-medium text-gold">
                      {lockedAmounts[id] ? `${netReceive(lockedAmounts[id]).toLocaleString(undefined, { maximumFractionDigits: 2 })} veBYND` : '…'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2 — summary */}
        <div className="space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-gold">
            2. Summary
          </p>
          <div className="rounded-control p-4 border border-void-border bg-bg space-y-3">
            <div className="flex items-start gap-2.5">
              <FileText size={13} className="text-white/[.38] mt-0.5 shrink-0" />
              <StatRow
                label="You receive"
                value={selected !== null && lockedAmounts[selected] ? `${netReceive(lockedAmounts[selected]).toLocaleString(undefined, { maximumFractionDigits: 2 })} veBYND` : '–'}
                accent={!!selected}
              />
            </div>
            <div className="flex items-start gap-2.5">
              <Clock size={13} className="text-white/[.38] mt-0.5 shrink-0" />
              <StatRow label="Lock duration" value="208 weeks (max, no withdrawal)" />
            </div>
            <div className="flex items-start gap-2.5">
              <Percent size={13} className="text-white/[.38] mt-0.5 shrink-0" />
              <StatRow label="Protocol fee" value={protocolFeeBps > 0 ? `${(protocolFeeBps / 100).toFixed(2)}%` : '0%'} />
            </div>
            <p className="text-xs text-white/[.38] leading-relaxed pt-2 border-t border-void-border">
              You receive veBYND 1:1 per MEZO locked{protocolFeeBps > 0 ? ', minus the protocol fee above' : ''}. Once
              deposited, this lock extends to veMEZO's 208-week maximum and can't be withdrawn — exit only via secondary markets.
            </p>
          </div>
        </div>
      </div>

      {/* Scroll hint — only rendered when there's genuinely more content
          below, and disappears once the user scrolls to the bottom. This
          directly replaces the old failure mode where content silently
          overflowed with zero indication a Confirm button existed below. */}
      {hasMoreBelow && (
        <div className="relative -mx-6 -mb-2">
          <div className="pointer-events-none absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-void-soft to-transparent" />
          <button
            onClick={() => listRef.current?.scrollBy({ top: 200, behavior: 'smooth' })}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-mono uppercase tracking-widest text-gold/80 hover:text-gold transition-colors"
          >
            <ChevronDown size={12} className="animate-bounce" />
            Scroll for more
          </button>
        </div>
      )}
    </Modal>
  );
};

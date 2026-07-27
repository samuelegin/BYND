'use client';

import React, { useState } from 'react';
import { AlertTriangle, Lock, FileText, Clock, Percent } from 'lucide-react';
import { Button, StatRow } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface LockMintConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: number;
  lockedAmount?: string;   // MEZO locked under this veMEZO NFT
  isPermanent: boolean;
  isExpired: boolean;
  protocolFeeBps?: number;
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onDeposit: (tokenId: number) => Promise<void>;
}

/**
 * Confirmation step for Lock & Mint, opened once the user has already
 * picked a veMEZO NFT from the select in the terminal card. Shows the full
 * breakdown (voting power / mint rate / lock duration / receive) plus any
 * per-token warnings, then submits on confirm — same modal pattern as
 * Stake and Claim.
 */
export const LockMintConfirmModal: React.FC<LockMintConfirmModalProps> = ({
  isOpen, onClose, tokenId, lockedAmount, isPermanent, isExpired, protocolFeeBps = 0,
  onUnlockPermanent, onDeposit,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const isBlocked = isPermanent || isExpired;

  // veBYND minted 1:1 per MEZO locked, minus the governance-set protocol
  // fee (0 unless governance has configured one on-chain).
  const netReceive = lockedAmount
    ? parseFloat(lockedAmount) * (1 - protocolFeeBps / 10000)
    : null;

  const handleDeposit = async () => {
    setStatus({ type: 'loading', message: 'Locking veMEZO NFT…' });
    try {
      await onDeposit(tokenId);
      setStatus({ type: 'success', message: 'Locked. veBYND minted 1:1' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Deposit failed' });
    }
  };

  const handleUnlock = async () => {
    setStatus({ type: 'loading', message: 'Converting to time-based lock…' });
    try {
      await onUnlockPermanent(tokenId);
      setStatus({ type: 'success', message: 'Done. You can now confirm below.' });
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Unlock failed' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Lock veMEZO #${tokenId}`}
      subtitle="Permanent · one-way · non-reversible"
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
              disabled={isBlocked}
              isLoading={status.type === 'loading'}
            >
              Lock &amp; Mint veBYND
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {isPermanent && (
          <div className="rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 space-y-2">
            <div className="flex gap-2">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-yellow-300 font-medium">
                  veMEZO #{tokenId} is permanently locked
                </p>
                <p className="text-xs text-white/60 leading-relaxed">
                  Convert to a time-based lock once — the vault re-locks it to 4 years automatically on deposit.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
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
          <div className="rounded-control p-3 border border-yellow-400/30 bg-yellow-400/5 flex gap-2">
            <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-white/60 leading-relaxed">
              <span className="text-yellow-300 font-medium">veMEZO #{tokenId}&rsquo;s lock has expired.</span>{' '}
              Withdraw and re-lock on Mezo&rsquo;s app, then deposit the fresh NFT here.
            </p>
          </div>
        )}

        <div className="rounded-control p-4 border border-void-border bg-bg space-y-3">
          <div className="flex items-start gap-2.5">
            <FileText size={13} className="text-white/[.38] mt-0.5 shrink-0" />
            <StatRow
              label="Voting power"
              value={lockedAmount ? `${parseFloat(lockedAmount).toLocaleString()} veMEZO` : '–'}
            />
          </div>
          <div className="flex items-start gap-2.5">
            <Lock size={13} className="text-white/[.38] mt-0.5 shrink-0" />
            <StatRow label="Mint rate" value="1:1 veBYND" accent />
          </div>
          <div className="flex items-start gap-2.5">
            <Clock size={13} className="text-white/[.38] mt-0.5 shrink-0" />
            <StatRow label="Lock duration" value="4 years (max)" />
          </div>
          {protocolFeeBps > 0 && (
            <div className="flex items-start gap-2.5">
              <Percent size={13} className="text-white/[.38] mt-0.5 shrink-0" />
              <StatRow label="Protocol fee" value={`${(protocolFeeBps / 100).toFixed(2)}%`} />
            </div>
          )}
          <div className="pt-3 border-t border-void-border flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
              You receive
            </span>
            <span className="text-xl font-semibold text-gold leading-none">
              {netReceive !== null ? `${netReceive.toLocaleString(undefined, { maximumFractionDigits: 2 })} veBYND` : '–'}
            </span>
          </div>
        </div>

        <p className="text-xs text-white/[.38] leading-relaxed">
          Locking is permanent and cannot be undone. To exit, trade veBYND on the veBYND/MEZO pool on secondary markets.
        </p>
      </div>
    </Modal>
  );
};

'use client';

import React, { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
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
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onDeposit: (tokenId: number) => Promise<void>;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, tokenIds, lockedAmounts = {}, permanentIds = [], onUnlockPermanent, onDeposit }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus]     = useState<TxStatus>({ type: null, message: null });

  const handleDeposit = async () => {
    if (selected === null) return;
    setStatus({ type: 'loading', message: 'Locking veMEZO NFT…' });
    try {
      await onDeposit(selected);
      setStatus({ type: 'success', message: 'Locked — veBYND minted 1:1' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Deposit failed' });
    }
  };

  const displayIds = tokenIds; // real token IDs only — no mock fallback

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Lock and mint veBYND" subtitle="Permanent 4-year lock · 1:1 veBYND minted">
      <div className="space-y-4">

        {/* Permanent lock warning — static info */}
        <div className="rounded-control p-3 border border-gold/20 bg-gold/5 flex gap-2">
          <Lock size={14} className="text-gold shrink-0 mt-0.5" />
          <p className="text-sm text-white/60 leading-relaxed">
            <span className="text-gold font-medium">Permanent lock.</span> Your veMEZO NFT cannot be withdrawn.
            Exit via the <span className="text-white/[.87] font-medium">veBYND/MEZO pool</span> on Mezo Swap.
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
                  The vault requires a time-based lock. Click below to convert it — this is a one-time
                  wallet transaction. The vault will immediately re-lock it to 4 years on your first deposit.
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
                  setStatus({ type: 'success', message: 'Done — you can now deposit. Click Lock and mint.' });
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

        <div className="space-y-2">
          {displayIds.length === 0 ? (
            <div className="rounded-control p-6 border border-void-border text-center">
              <p className="text-sm text-white/60">No veMEZO NFTs in wallet</p>
            </div>
          ) : displayIds.map(id => (
            <button
              key={id}
              onClick={() => setSelected(id)}
              className={clsx(
                'w-full flex items-center justify-between rounded-control p-4 border transition-all duration-200',
                selected === id ? 'border-gold/50 bg-gold/5' : 'border-void-border hover:border-white/[.12]'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-4 h-4 rounded-full border transition-colors',
                  selected === id ? 'border-gold bg-gold' : 'border-white/[.38]'
                )} />
                <div className="text-left">
                  <span className="text-sm font-medium text-white/[.87]">veMEZO #{id}</span>
                  <p className="text-xs text-white/60">{lockedAmounts[id] ? `~${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO locked · extended to 4yr` : 'Loading…'}</p>
                </div>
              </div>
              <span className="font-mono text-xs font-medium text-gold">{lockedAmounts[id] ? `${parseFloat(lockedAmounts[id]).toLocaleString()} veBYND` : '…'}</span>
            </button>
          ))}
        </div>

        <div className="rounded-control p-3 border border-void-border bg-bg">
          <StatRow label="You receive"    value={selected !== null && lockedAmounts[selected] ? `${parseFloat(lockedAmounts[selected]).toLocaleString()} veBYND` : '–'} accent={!!selected} />
          <StatRow label="Lock duration"  value="4 years (max, permanent)" />
          <StatRow label="Protocol fee"   value="None (on deposit)" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleDeposit}
                  disabled={selected === null || (selected !== null && permanentIds.includes(selected))}
                  isLoading={status.type === 'loading'}>
            Lock and mint veBYND
          </Button>
        </div>
      </div>
    </Modal>
  );
};

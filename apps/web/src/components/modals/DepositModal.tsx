'use client';

import React, { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Input, StatRow } from '@/components/ui';
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
    setStatus({ type: 'loading', message: 'Locking veMEZO NFT...' });
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
    <Modal isOpen={isOpen} onClose={onClose} title="Lock & Mint veBYND" subtitle="Permanent 4-year lock · 1:1 veBYND minted">
      <div className="space-y-4">

        {/* Permanent lock warning — static info */}
        <div className="p-3 border border-acid/20 bg-acid/3 flex gap-2">
          <Lock size={13} className="text-acid shrink-0 mt-0.5" />
          <p className="font-mono text-[9px] text-silver-dim uppercase tracking-wider leading-relaxed">
            <span className="text-acid font-bold">Permanent lock.</span> Your veMEZO NFT cannot be withdrawn.
            Exit via the <span className="text-silver font-bold">veBYND/MEZO pool</span> on Mezo Swap.
          </p>
        </div>

        {/* Per-token warning + one-click unlock when a permanently locked NFT is selected */}
        {selected !== null && permanentIds.includes(selected) && (
          <div className="p-3 border border-yellow-400/40 bg-yellow-400/5 space-y-2">
            <div className="flex gap-2">
              <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-mono text-[9px] text-yellow-300 uppercase tracking-wider font-bold">
                  veMEZO #{selected} is permanently locked
                </p>
                <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                  The vault requires a time-based lock. Click below to convert it — this is a one-time
                  wallet transaction. The vault will immediately re-lock it to 4 years on your first deposit.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
              onClick={async () => {
                setStatus({ type: 'loading', message: 'Converting to time-based lock...' });
                try {
                  await onUnlockPermanent(selected);
                  setStatus({ type: 'success', message: 'Done — you can now deposit. Click Lock & Mint.' });
                } catch (e: any) {
                  setStatus({ type: 'error', message: e.message || 'Unlock failed' });
                }
              }}
              isLoading={status.type === 'loading'}
            >
              Unlock Permanent Lock
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {displayIds.length === 0 ? (
            <div className="p-6 border border-void-border text-center">
              <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">No veMEZO NFTs in wallet</p>
            </div>
          ) : displayIds.map(id => (
            <button
              key={id}
              onClick={() => setSelected(id)}
              className={clsx(
                'w-full flex items-center justify-between p-4 border transition-all duration-200',
                selected === id ? 'border-acid/60 bg-acid/5' : 'border-void-border hover:border-void-muted'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-4 h-4 border transition-colors',
                  selected === id ? 'border-acid bg-acid' : 'border-void-muted'
                )} />
                <div className="text-left">
                  <span className="font-mono text-[10px] font-black text-silver uppercase">veMEZO #{id}</span>
                  <p className="font-mono text-[8px] text-silver-dim">{lockedAmounts[id] ? `~${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO locked · extended to 4yr` : 'Loading...'}</p>
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-acid">{lockedAmounts[id] ? `${parseFloat(lockedAmounts[id]).toLocaleString()} veBYND` : '...'}</span>
            </button>
          ))}
        </div>

        <div className="p-3 border border-void-border bg-void">
          <StatRow label="You Receive"    value={selected !== null && lockedAmounts[selected] ? `${parseFloat(lockedAmounts[selected]).toLocaleString()} veBYND` : '–'} accent={!!selected} />
          <StatRow label="Lock Duration"  value="4 Years (max, permanent)" />
          <StatRow label="Protocol Fee"   value="None (on deposit)" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleDeposit}
                  disabled={selected === null || (selected !== null && permanentIds.includes(selected))}
                  isLoading={status.type === 'loading'}>
            Lock & Mint veBYND
          </Button>
        </div>
      </div>
    </Modal>
  );
};

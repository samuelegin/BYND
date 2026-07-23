'use client';

import React, { useState } from 'react';
import { Button, Divider, StatRow } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface ClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimableRewards: { token: string; symbol: string; amount: string }[];
  onClaim: () => Promise<void>;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({
  isOpen, onClose, claimableRewards, onClaim,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleClaim = async () => {
    setStatus({ type: 'loading', message: 'Claiming rewards…' });
    try {
      await onClaim();
      setStatus({ type: 'success', message: 'Rewards claimed to wallet' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Claim failed' });
    }
  };

  const hasAny = claimableRewards.some(r => parseFloat(r.amount || '0') > 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Claim yield" subtitle="Bribes captured this epoch · pro-rata share">
      <div className="space-y-4">
        <div className="rounded-control p-6 border border-gold/20 bg-gold/5 space-y-4">
          {claimableRewards.length === 0 ? (
            <p className="text-sm text-white/60">No reward tokens registered yet.</p>
          ) : (
            claimableRewards.map((r, i) => (
              <div key={r.token}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-1">
                  {r.symbol} rewards
                </p>
                <p className={i === 0 ? 'text-3xl font-semibold text-gold' : 'text-xl font-semibold text-white/[.87]'}>
                  {parseFloat(r.amount || '0').toFixed(i === 0 ? 2 : 4)}
                </p>
              </div>
            ))
          )}
          <Divider />
          <StatRow label="Reward tokens" value={`${claimableRewards.length}`} accent />
        </div>
        <TxBlock status={status} />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleClaim}
                  disabled={!hasAny}
                  isLoading={status.type === 'loading'}>
            Claim all rewards
          </Button>
        </div>
      </div>
    </Modal>
  );
};

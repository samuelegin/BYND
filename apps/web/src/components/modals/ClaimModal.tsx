'use client';

import React, { useState } from 'react';
import { Button, Divider, StatRow } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface ClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimableMUSD: string;
  claimableMEZO: string;
  onClaim: () => Promise<void>;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({
  isOpen, onClose, claimableMUSD, claimableMEZO, onClaim,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleClaim = async () => {
    setStatus({ type: 'loading', message: 'Claiming rewards…' });
    try {
      await onClaim();
      setStatus({ type: 'success', message: 'MUSD rewards claimed to wallet' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Claim failed' });
    }
  };

  const totalUSD = (
    parseFloat(claimableMUSD || '0') +
    parseFloat(claimableMEZO || '0') * 0.08
  ).toFixed(2);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Claim MUSD yield" subtitle="MUSD bribes · pro-rata share">
      <div className="space-y-4">
        <div className="rounded-control p-6 border border-gold/20 bg-gold/5 space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-1">MUSD rewards</p>
            <p className="text-3xl font-semibold text-gold">{parseFloat(claimableMUSD || '0').toFixed(2)}</p>
            <p className="text-xs text-white/60 mt-0.5">From MUSD bribes captured each epoch</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-1">MEZO rewards</p>
            <p className="text-xl font-semibold text-white/[.87]">{parseFloat(claimableMEZO || '0').toFixed(4)}</p>
          </div>
          <Divider />
          <StatRow label="Est. total value" value={`~$${totalUSD}`} accent />
        </div>
        <TxBlock status={status} />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleClaim}
                  disabled={parseFloat(claimableMUSD) === 0 && parseFloat(claimableMEZO) === 0}
                  isLoading={status.type === 'loading'}>
            Claim all rewards
          </Button>
        </div>
      </div>
    </Modal>
  );
};

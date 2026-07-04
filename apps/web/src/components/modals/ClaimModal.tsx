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
    setStatus({ type: 'loading', message: 'Claiming rewards...' });
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
    <Modal isOpen={isOpen} onClose={onClose} title="Claim MUSD Yield" subtitle="MUSD bribes · pro-rata share">
      <div className="space-y-4">
        <div className="p-6 border border-acid/20 bg-acid/3 space-y-4">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">MUSD Rewards</p>
            <p className="text-3xl font-black text-acid">{parseFloat(claimableMUSD || '0').toFixed(2)}</p>
            <p className="font-mono text-[7px] text-silver-dim mt-0.5">From MUSD bribes captured each epoch</p>
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">MEZO Rewards</p>
            <p className="text-xl font-bold text-silver">{parseFloat(claimableMEZO || '0').toFixed(4)}</p>
          </div>
          <Divider />
          <StatRow label="Est. Total Value" value={`~$${totalUSD}`} accent />
        </div>
        <TxBlock status={status} />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleClaim}
                  disabled={parseFloat(claimableMUSD) === 0 && parseFloat(claimableMEZO) === 0}
                  isLoading={status.type === 'loading'}>
            Claim All Rewards
          </Button>
        </div>
      </div>
    </Modal>
  );
};

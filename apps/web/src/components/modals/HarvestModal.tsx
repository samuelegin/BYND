'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button, StatRow } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface HarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingIncentives: string;
  bountyBps: number;
  epochVoted: boolean;
  epochHarvested: boolean;
  onHarvest: () => Promise<void>;
}

export const HarvestModal: React.FC<HarvestModalProps> = ({
  isOpen, onClose, pendingIncentives, bountyBps, epochVoted, epochHarvested, onHarvest,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });
  const bounty = (parseFloat(pendingIncentives.replace(/[$,]/g, '')) * bountyBps / 10000).toFixed(2);

  const handleHarvest = async () => {
    setStatus({ type: 'loading', message: 'Harvesting MUSD from gauges...' });
    try {
      await onHarvest();
      setStatus({ type: 'success', message: `Harvested — your bounty: ${bounty} MUSD` });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'harvestAndDistribute() failed' });
    }
  };

  const canHarvest = epochVoted && !epochHarvested;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Harvest & Distribute" subtitle="Claim keeper bounty · Forward MUSD to stakers">
      <div className="space-y-4">
        {!epochVoted && (
          <div className="p-3 border border-orange-500/20 bg-orange-500/5 flex gap-2">
            <AlertTriangle size={14} className="text-orange-400 shrink-0" />
            <p className="font-mono text-[9px] text-orange-400 uppercase tracking-wider">castVotes() must be called before harvesting.</p>
          </div>
        )}
        {epochHarvested && (
          <div className="p-3 border border-void-border flex gap-2">
            <CheckCircle2 size={14} className="text-acid shrink-0" />
            <p className="font-mono text-[9px] text-acid uppercase tracking-wider">Already harvested this epoch.</p>
          </div>
        )}

        <div className="p-4 border border-void-border bg-void space-y-1">
          <StatRow label="Pending Incentives" value={pendingIncentives}   accent />
          <StatRow label="Your Keeper Bounty" value={`~${bounty} MUSD`} accent />
          <StatRow label="Bounty Rate"        value={`${bountyBps / 100}% of harvest`} />
          <StatRow label="Remainder"          value="→ veBYND stakers (pro-rata)" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleHarvest}
                  disabled={!canHarvest} isLoading={status.type === 'loading'}>
            Harvest Now
          </Button>
        </div>
      </div>
    </Modal>
  );
};

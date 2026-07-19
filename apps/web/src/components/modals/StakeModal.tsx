'use client';

import React, { useState } from 'react';
import { Button, Input, StatRow } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  veByndBalance: string;
  avgApr: string;
  rewardTokenSymbol: string;
  onStake: (amount: string) => Promise<void>;
  onCheckAllowance: (amount: string) => Promise<boolean>;
  onApprove: (amount: string) => Promise<void>;
}

export const StakeModal: React.FC<StakeModalProps> = ({
  isOpen, onClose, veByndBalance, avgApr, rewardTokenSymbol, onStake, onCheckAllowance, onApprove,
}) => {
  const [amount, setAmount]       = useState('');
  const [status, setStatus]       = useState<TxStatus>({ type: null, message: null });

  const checkAndStake = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStatus({ type: 'loading', message: 'Checking allowance…' });
    try {
      const approved = await onCheckAllowance(amount);
      if (!approved) {
        setStatus({ type: 'loading', message: 'Approving veBYND…' });
        await onApprove(amount);
      }
      setStatus({ type: 'loading', message: 'Staking veBYND…' });
      await onStake(amount);
      setStatus({ type: 'success', message: 'Staked — MUSD yield now active' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Staking failed' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stake veBYND" subtitle="Activate MUSD + MEZO yield">
      <div className="space-y-4">
        <Input
          label="Amount"
          hint={`Available: ${parseFloat(veByndBalance || '0').toFixed(2)} veBYND`}
          value={amount}
          onChange={setAmount}
          type="number"
          placeholder="0.00"
          max={veByndBalance}
        />

        <div className="rounded-control p-3 border border-void-border bg-bg">
          <StatRow label="Protocol APR"    value={avgApr || '–'}        accent />
          <StatRow label="Reward tokens"   value={`${rewardTokenSymbol || 'MUSD'} + ERC-20 bribes`} />
          <StatRow label="Sources"         value="Gauge bribes + vote rebases" />
          <StatRow label="Unbonding"       value="None" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={checkAndStake}
                  disabled={!amount || parseFloat(amount) <= 0}
                  isLoading={status.type === 'loading'}>
            Stake veBYND
          </Button>
        </div>
      </div>
    </Modal>
  );
};

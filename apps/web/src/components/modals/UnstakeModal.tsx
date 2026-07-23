'use client';

import React, { useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface UnstakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  stakedBalance: string;
  onUnstake: (amount: string) => Promise<void>;
}

export const UnstakeModal: React.FC<UnstakeModalProps> = ({ isOpen, onClose, stakedBalance, onUnstake }) => {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleUnstake = async () => {
    setStatus({ type: 'loading', message: 'Unstaking veBYND…' });
    try {
      await onUnstake(amount);
      setStatus({ type: 'success', message: 'Unstaked — veBYND returned to wallet' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Unstake failed' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unstake veBYND" subtitle="Returns veBYND to wallet · stops yield">
      <div className="space-y-4">
        <Input
          label="Amount"
          hint={`Staked: ${parseFloat(stakedBalance || '0').toFixed(2)} veBYND`}
          value={amount}
          onChange={setAmount}
          type="number"
          placeholder="0.00"
          max={stakedBalance}
        />
        <p className="text-sm text-white/60 leading-relaxed">
          After unstaking, sell veBYND on the <span className="text-gold">veBYND/MEZO pool</span> on Mezo Swap for exit liquidity.
        </p>
        <TxBlock status={status} />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="outline" className="flex-1" onClick={handleUnstake}
                  disabled={!amount || parseFloat(amount) <= 0}
                  isLoading={status.type === 'loading'}>
            Unstake
          </Button>
        </div>
      </div>
    </Modal>
  );
};

'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { Modal } from './Modal';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenIds: number[];
  onWithdraw: (tokenId: number) => Promise<void>;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Withdrawal Unavailable" subtitle="Permanent lock protocol">
      <div className="space-y-4">
        <div className="p-4 border border-orange-500/20 bg-orange-500/5 flex gap-3">
          <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-black text-orange-400 uppercase tracking-wider">
              veMEZO is permanently locked
            </p>
            <p className="font-mono text-[9px] text-orange-400/80 leading-relaxed uppercase tracking-wider">
              BynD permanently locks all deposited veMEZO to the 4-year maximum to maintain 100% governance weight.
              There is no withdrawal function by design.
            </p>
          </div>
        </div>

        <div className="p-4 border border-acid/20 bg-acid/3 space-y-2">
          <p className="font-mono text-[9px] font-black text-acid uppercase tracking-wider">Your exit path: veBYND/MEZO pool</p>
          <p className="font-mono text-[9px] text-silver-dim leading-relaxed uppercase tracking-wider">
            Unstake your veBYND from the Staking Terminal, then sell it on the veBYND/MEZO liquidity pool
            on Mezo Swap. BynD seeds this pool at launch to guarantee exit liquidity at market price.
          </p>
        </div>

        <Button variant="ghost" fullWidth onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
};

'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, StatRow, formatTime } from '@/components/ui';
import type { TxStatus } from '@/types';
import { Modal } from './Modal';
import { TxBlock } from './TxBlock';

interface CastVotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalPower: string;
  gauges: { name: string; weightBps: number }[];
  epochVoted: boolean;
  timeUntilNextVote: number;
  onCastVotes: () => Promise<void>;
}

export const CastVotesModal: React.FC<CastVotesModalProps> = ({
  isOpen, onClose, totalPower, gauges, epochVoted, timeUntilNextVote, onCastVotes,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleCast = async () => {
    setStatus({ type: 'loading', message: 'Casting votes on-chain…' });
    try {
      await onCastVotes();
      setStatus({ type: 'success', message: 'Votes cast — veBTC gauges activated' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'optimiseAndVote() failed' });
    }
  };

  const canVote = timeUntilNextVote === 0 && !epochVoted;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cast system votes" subtitle="Permissionless — earn keeper bounty">
      <div className="space-y-4">
        {!canVote && (
          <div className="rounded-control p-3 border border-orange-500/20 bg-orange-500/5 flex gap-2">
            <AlertTriangle size={14} className="text-orange-400 shrink-0" />
            <p className="text-sm text-orange-400 leading-relaxed">
              {epochVoted ? 'Votes already cast this epoch.' : `Vote window opens in ${formatTime(timeUntilNextVote)}.`}
            </p>
          </div>
        )}

        <div className="rounded-control p-3 border border-void-border bg-bg">
          <StatRow label="Total veMEZO power" value={totalPower} accent />
          <StatRow label="Target gauges"      value={`${gauges.length} veBTC positions`} />
        </div>

        <div className="space-y-2">
          {gauges.map((g, i) => (
            <div key={i} className="flex justify-between items-center rounded-control p-3 border border-void-border">
              <span className="text-sm text-white/[.87]">{g.name}</span>
              <span className="font-mono text-xs font-medium text-gold">{(g.weightBps / 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleCast}
                  disabled={!canVote} isLoading={status.type === 'loading'}>
            Cast votes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

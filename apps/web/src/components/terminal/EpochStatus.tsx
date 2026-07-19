import React from 'react';
import { Panel, StatRow, formatTime } from '@/components/ui';
import type { EpochState, ProtocolStats } from '@/types';

interface EpochStatusProps {
  epoch: EpochState;
  stats: ProtocolStats;
  mezoEpoch: number;
  liveCountdown: number;
}

export function EpochStatus({ epoch, stats, mezoEpoch, liveCountdown }: EpochStatusProps) {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-4">
        Epoch status
      </p>
      <StatRow label="Current epoch" value={`#${mezoEpoch}`} />
      <StatRow label="Time remaining" value={formatTime(liveCountdown)} />
      <StatRow
        label="Locks extended"
        value={epoch.epochLocksExtended ? '✓ Yes' : 'No'}
        accent={epoch.epochLocksExtended}
      />
      <StatRow
        label="Votes cast"
        value={epoch.epochVoted ? '✓ Yes' : 'No'}
        accent={epoch.epochVoted}
      />
      <StatRow
        label="Harvested"
        value={epoch.epochHarvested ? '✓ Yes' : 'No'}
        accent={epoch.epochHarvested}
      />
      <StatRow label="Keeper bounty" value={`${stats.bountyBps / 100}% MUSD`} />
    </Panel>
  );
}

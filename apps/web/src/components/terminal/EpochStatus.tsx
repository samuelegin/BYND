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
      <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-4">
        Epoch Status
      </p>
      <StatRow label="Current Epoch" value={`#${mezoEpoch}`} />
      <StatRow label="Time Remaining" value={formatTime(liveCountdown)} />
      <StatRow
        label="Locks Extended"
        value={epoch.epochLocksExtended ? '✓ Yes' : 'No'}
        accent={epoch.epochLocksExtended}
      />
      <StatRow
        label="Votes Cast"
        value={epoch.epochVoted ? '✓ Yes' : 'No'}
        accent={epoch.epochVoted}
      />
      <StatRow
        label="Harvested"
        value={epoch.epochHarvested ? '✓ Yes' : 'No'}
        accent={epoch.epochHarvested}
      />
      <StatRow label="Keeper Bounty" value={`${stats.bountyBps / 100}% MUSD`} />
    </Panel>
  );
}

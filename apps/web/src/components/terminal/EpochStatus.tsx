import React from 'react';
import { Panel, StatRow, formatTime, formatWAT } from '@/components/ui';
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
      <StatRow label="Mezo epoch ends" value={formatWAT(epoch.mezoEpochEndsAt)} />
      <StatRow label="Vote window opens" value={formatWAT(epoch.mezoVoteWindowOpensAt)} />
      {/* This is the countdown that actually gates optimiseAndVote() —
          driven by ByNdVoter's own on-chain clock, not the WAT times above. */}
      <StatRow label="Time remaining" value={formatTime(liveCountdown)} />
      {epoch.clockDrifted && (
        <StatRow
          label="⚠ Clock drift"
          value="Contract ≠ Mezo time"
          accent
        />
      )}
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

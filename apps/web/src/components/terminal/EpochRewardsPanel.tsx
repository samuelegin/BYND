import React from 'react';
import { Panel, StatRow, formatTime, formatWAT } from '@/components/ui';
import type { EpochState, ProtocolStats } from '@/types';

export function EpochRewardsPanel({
  epoch, stats, mezoEpoch, liveCountdown,
}: {
  epoch: EpochState;
  stats: ProtocolStats;
  mezoEpoch: number;
  liveCountdown: number;
}) {
  return (
    <Panel className="p-6 h-full">
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-4">
        Epoch &amp; rewards
      </p>
      <StatRow label="Current epoch" value={`#${mezoEpoch}`} />
      <StatRow label="Vote window opens" value={formatWAT(epoch.mezoVoteWindowOpensAt)} />
      <StatRow label="Time remaining" value={formatTime(liveCountdown)} />
      {epoch.clockDrifted && (
        <StatRow label="⚠ Clock drift" value="Contract ≠ Mezo time" accent />
      )}
      <StatRow label="Locks extended" value={epoch.epochLocksExtended ? '✓ Yes' : 'No'} accent={epoch.epochLocksExtended} />
      <StatRow label="Votes cast" value={epoch.epochVoted ? '✓ Yes' : 'No'} accent={epoch.epochVoted} />
      <StatRow label="Harvested" value={epoch.epochHarvested ? '✓ Yes' : 'No'} accent={epoch.epochHarvested} />
      <StatRow label="Keeper bounty" value={`${stats.bountyBps / 100}% ${stats.rewardTokenSymbol}`} />
    </Panel>
  );
}

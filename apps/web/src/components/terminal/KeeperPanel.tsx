import React, { useState } from 'react';
import { Code2, HandCoins, RefreshCw, Shield, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, Button, Badge, formatTime } from '@/components/ui';
import type { EpochState, ProtocolStats } from '@/types';

interface KeeperPanelProps {
  epoch: EpochState;
  stats: ProtocolStats;
  canExtend: boolean;
  extendingLocks: boolean;
  timeToVoteOpen: number;
  onExtendLocks: () => void;
  onCastVotes: () => void;
  onClaimBribes: () => void;
  claimingBribes: boolean;
  onHarvest: () => void;
}

// Keeper actions shown as human-readable status rows. The underlying
// contract function name is only ever shown when the person explicitly
// opts into developer mode — nobody needs to see optimiseAndVote() to
// understand "Vote is available".
export function KeeperPanel({
  epoch, stats, canExtend, extendingLocks, timeToVoteOpen, onExtendLocks, onCastVotes,
  onClaimBribes, claimingBribes, onHarvest,
}: KeeperPanelProps) {
  const [devMode, setDevMode] = useState(false);

  const voteWindowOpen = timeToVoteOpen <= 0;
  const canVote = !epoch.epochVoted && voteWindowOpen;
  // claimBribesBatch() sits between voting and harvesting: it takes the epoch
  // snapshot and pulls each managed NFT's bribes in.
  const bribesClaimed = epoch.claimBribesReady;
  // pendingIncentives (previewOptimalGauge()'s bestScore) is the same
  // "is there actually anything here" check HarvestModal already uses to
  // gate harvestAndDistribute(). Without it, "Ready" showed as soon as votes
  // were cast, even when the bribe for this epoch hadn't checkpointed in
  // yet (bribes deposited mid-epoch settle on the NEXT epoch's snapshot on
  // Mezo's bribe contract) — so claimBribesBatch() would fire, succeed, and
  // move nothing, then harvestAndDistribute() would correctly refuse right
  // after. Gating here on the same signal stops that dead-end tx before it
  // happens instead of only catching it one step later.
  const nothingPending = parseFloat(stats.pendingIncentives.replace(/[$,]/g, '')) === 0
    || Number.isNaN(parseFloat(stats.pendingIncentives.replace(/[$,]/g, '')));
  const canClaimBribes = epoch.epochVoted && !epoch.epochHarvested && !bribesClaimed && !nothingPending;
  // harvestAndDistribute() requires epochSnapshotTaken && cursor >= total
  // on-chain. Gating on epochVoted alone showed READY for a call that always
  // reverted with "ByNdVoter: call claimBribesBatch first".
  const canHarvest = epoch.epochVoted && !epoch.epochHarvested && bribesClaimed;

  const rows = [
    {
      icon: Shield,
      fn: 'extendLocks()',
      title: 'Extend locks',
      detail: epoch.epochLocksExtended
        ? 'Already done this epoch'
        : canExtend
          ? 'Reset all veMEZO to 4-yr max'
          : `Available in ${formatTime(epoch.timeUntilExtendWindow)}`,
      status: epoch.epochLocksExtended ? 'Done' : canExtend ? 'Ready' : 'Wait',
      variant: epoch.epochLocksExtended ? 'muted' : canExtend ? 'acid' : 'muted',
      onClick: onExtendLocks,
      disabled: !canExtend,
      loading: extendingLocks,
      spin: false,
    },
    {
      icon: RefreshCw,
      fn: 'optimiseAndVote()',
      title: 'Vote',
      detail: epoch.epochVoted
        ? 'Voted this epoch'
        : voteWindowOpen
          ? 'Vote window open'
          : `Available in ${formatTime(timeToVoteOpen)}`,
      status: epoch.epochVoted ? 'Done' : !voteWindowOpen ? 'Wait' : 'Ready',
      variant: epoch.epochVoted ? 'muted' : !voteWindowOpen ? 'muted' : 'acid',
      onClick: onCastVotes,
      disabled: !canVote,
      loading: false,
      spin: canVote,
    },
    {
      icon: HandCoins,
      fn: 'claimBribesBatch(200)',
      title: 'Claim bribes',
      detail: bribesClaimed
        ? 'Processed this epoch'
        : canClaimBribes
          ? epoch.claimBribesTotal > 200
            // Paging only matters above MAX_CLAIM_BATCH; below that it is always
            // a single press, so the counter would be noise.
            ? `Required before harvest · ${epoch.claimBribesCursor}/${epoch.claimBribesTotal}`
            : 'Required before harvest'
          : !epoch.epochVoted
            ? 'Needs votes cast first'
            // Votes are in but the bribe hasn't checkpointed on Mezo's side
            // yet — usually settles on the next epoch boundary, not instant.
            : 'Nothing to claim yet',
      status: bribesClaimed ? 'Done' : canClaimBribes ? 'Ready' : 'Wait',
      variant: bribesClaimed ? 'muted' : canClaimBribes ? 'acid' : 'muted',
      onClick: onClaimBribes,
      disabled: !canClaimBribes,
      loading: claimingBribes,
      spin: false,
    },
    {
      icon: Zap,
      fn: 'harvestAndDistribute()',
      title: 'Harvest rewards',
      detail: epoch.epochHarvested
        ? `Earned ${stats.bountyBps / 100}% bounty`
        : canHarvest
          ? `Ready · earn ${stats.bountyBps / 100}% bounty`
          : epoch.epochVoted
            ? 'Claim bribes first'
            : 'Needs votes cast first',
      status: epoch.epochHarvested ? 'Done' : canHarvest ? 'Ready' : 'Wait',
      variant: epoch.epochHarvested ? 'muted' : canHarvest ? 'acid' : 'muted',
      onClick: onHarvest,
      disabled: !canHarvest,
      loading: false,
      spin: false,
    },
  ] as const;

  return (
    <Panel className="p-6 h-full">
      <div className="flex items-center justify-between mb-1">
        <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
          Keeper
        </p>
        <button
          onClick={() => setDevMode(v => !v)}
          className={clsx(
            'flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
            devMode ? 'text-gold' : 'text-white/[.38] hover:text-white/60',
          )}
        >
          <Code2 size={11} /> Dev mode
        </button>
      </div>
      <p className="text-sm text-white/60 mb-5">
        Permissionless. Earn bounties each epoch.
      </p>

      <div className="space-y-2">
        {rows.map(row => {
          const Icon = row.icon;
          return (
            <div
              key={row.title}
              className={clsx(
                'rounded-control border p-3 space-y-2 transition-colors',
                row.variant === 'acid' ? 'border-gold/30 bg-gold/5' : 'border-void-border',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={13} className={clsx(row.variant === 'acid' ? 'text-gold' : 'text-white/60', 'shrink-0', row.spin && 'animate-spin')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/[.87] truncate">{row.title}</p>
                    <p className="text-xs text-white/60 truncate">{row.detail}</p>
                  </div>
                </div>
                <Badge variant={row.status === 'Done' ? 'muted' : row.status === 'Ready' ? 'acid' : 'muted'}>
                  {row.status}
                </Badge>
              </div>
              <Button
                variant={row.variant === 'acid' ? 'outline' : 'ghost'}
                size="sm"
                fullWidth
                onClick={row.onClick}
                disabled={row.disabled}
                isLoading={row.loading}
              >
                {devMode ? <span className="font-mono">{row.fn}</span> : row.title}
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

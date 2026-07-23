import React from 'react';
import { RefreshCw, Shield, Zap } from 'lucide-react';
import { Panel, Button, Badge, formatTime } from '@/components/ui';
import type { EpochState, ProtocolStats } from '@/types';

interface KeeperFunctionsProps {
  epoch: EpochState;
  stats: ProtocolStats;
  canExtend: boolean;
  extendingLocks: boolean;
  timeToVoteOpen: number;
  onExtendLocks: () => void;
  onCastVotes: () => void;
  onHarvest: () => void;
}

export function KeeperFunctions({
  epoch, stats, canExtend, extendingLocks, timeToVoteOpen, onExtendLocks, onCastVotes, onHarvest,
}: KeeperFunctionsProps) {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-1">
        Keeper functions
      </p>
      <p className="text-sm text-white/60 mb-5">
        Permissionless. Earn bounties each epoch.
      </p>

      <div className="space-y-2">
        {/* extendLocks */}
        <div className={`rounded-control border p-3 space-y-2 transition-colors ${canExtend ? 'border-gold/30 bg-gold/5' : 'border-void-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Shield size={13} className={canExtend ? 'text-gold shrink-0' : 'text-white/60 shrink-0'} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/[.87] truncate">
                  Protocol maintenance
                </p>
                <p className="text-xs text-white/60">
                  {epoch.epochLocksExtended
                    ? 'Reset all veMEZO to 4-yr max'
                    : canExtend
                      ? 'Reset all veMEZO to 4-yr max'
                      : `Cooldown — ready in ${formatTime(Math.max(0, epoch.extendCooldownEndsAt - Math.floor(Date.now() / 1000)))}`}
                </p>
              </div>
            </div>
            {epoch.epochLocksExtended ? (
              <Badge variant="acid">Done</Badge>
            ) : canExtend ? (
              <Badge variant="orange">Ready</Badge>
            ) : (
              <Badge variant="muted">Wait</Badge>
            )}
          </div>
          <Button
            variant={canExtend ? 'outline' : 'ghost'}
            size="sm"
            fullWidth
            onClick={onExtendLocks}
            disabled={!canExtend || extendingLocks}
            isLoading={extendingLocks}
          >
            <span className="font-mono">extendLocks()</span>
          </Button>
        </div>

        {/* castVotes */}
        <div className={`rounded-control border p-3 space-y-2 transition-colors ${!epoch.epochVoted && timeToVoteOpen === 0 ? 'border-gold/30 bg-gold/5' : 'border-void-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw
                size={13}
                className={`text-gold shrink-0 ${timeToVoteOpen === 0 && !epoch.epochVoted ? 'animate-spin' : ''}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/[.87] truncate">
                  Cast system votes
                </p>
                <p className="text-xs text-white/60">
                  {epoch.epochVoted
                    ? 'Voted this epoch'
                    : timeToVoteOpen > 0
                      ? `Opens in ${formatTime(timeToVoteOpen)}`
                      : 'Open now — 4h window'}
                </p>
              </div>
            </div>
            {epoch.epochVoted && <Badge variant="acid">Done</Badge>}
          </div>
          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={onCastVotes}
            disabled={epoch.epochVoted || timeToVoteOpen > 0}
          >
            <span className="font-mono">optimiseAndVote()</span>
          </Button>
        </div>

        {/* harvestAndDistribute */}
        <div className={`rounded-control border p-3 space-y-2 transition-colors ${epoch.epochVoted && !epoch.epochHarvested ? 'border-gold/30 bg-gold/5' : 'border-void-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Zap size={13} className="text-gold shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/[.87] truncate">
                  Harvest and distribute
                </p>
                <p className="text-xs text-white/60">
                  Earn {stats.bountyBps / 100}% on harvest
                </p>
              </div>
            </div>
            {epoch.epochHarvested && <Badge variant="muted">Done</Badge>}
          </div>
          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={onHarvest}
            disabled={!epoch.epochVoted || epoch.epochHarvested}
          >
            <span className="font-mono">harvestAndDistribute()</span>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

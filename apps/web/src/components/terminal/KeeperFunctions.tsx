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
      <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-1">
        Keeper Functions
      </p>
      <p className="font-mono text-[8px] text-silver-dim mb-5 uppercase tracking-wider">
        Permissionless. Earn bounties each epoch.
      </p>

      <div className="space-y-2">
        {/* extendLocks */}
        <div className={`border p-3 space-y-2 transition-colors ${canExtend ? 'border-acid/40 bg-acid/3' : 'border-void-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Shield size={11} className={canExtend ? 'text-acid shrink-0' : 'text-silver-dim shrink-0'} />
              <div className="min-w-0">
                <p className="font-mono text-[8px] uppercase font-black text-silver truncate">
                  Protocol Maintenance
                </p>
                <p className="font-mono text-[7px] text-silver-dim">
                  Reset all veMEZO to 4-yr max
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
            extendLocks()
          </Button>
        </div>

        {/* castVotes */}
        <div className={`border p-3 space-y-2 transition-colors ${!epoch.epochVoted && timeToVoteOpen === 0 ? 'border-acid/40 bg-acid/3' : 'border-void-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw
                size={11}
                className={`text-acid shrink-0 ${timeToVoteOpen === 0 && !epoch.epochVoted ? 'animate-spin' : ''}`}
              />
              <div className="min-w-0">
                <p className="font-mono text-[8px] uppercase font-black text-silver truncate">
                  Cast System Votes
                </p>
                <p className="font-mono text-[7px] text-silver-dim">
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
            castVotes()
          </Button>
        </div>

        {/* harvestAndDistribute */}
        <div className={`border p-3 space-y-2 transition-colors ${epoch.epochVoted && !epoch.epochHarvested ? 'border-acid/40 bg-acid/3' : 'border-void-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Zap size={11} className="text-acid shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-[8px] uppercase font-black text-silver truncate">
                  Harvest & Distribute
                </p>
                <p className="font-mono text-[7px] text-silver-dim">
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
            harvestAndDistribute()
          </Button>
        </div>
      </div>
    </Panel>
  );
}

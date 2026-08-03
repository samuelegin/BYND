import React from 'react';
import {
  WithdrawModal,
  UnstakeModal,
  CastVotesModal,
  HarvestModal,
} from '@/components/modals';
import type { EpochState, GaugeAllocation, ProtocolStats, UserPosition } from '@/types';

interface TerminalModalsProps {
  activeModal: string | null;
  onClose: () => void;
  position: UserPosition;
  stats: ProtocolStats;
  epoch: EpochState;
  gauges: GaugeAllocation[];
  timeToVoteOpen: number;
  onWithdraw: (tokenId: number) => Promise<void>;
  onUnstake: (amount: string) => Promise<void>;
  onCastVotes: () => Promise<void>;
  onHarvest: () => Promise<void>;
}

// Lock & Mint (Step 1), Stake (Step 2), and Claim all now happen inline in
// their respective terminal cards -- they read like completing a
// transaction, not opening a separate dialog. This leaves modals for the
// lower-frequency, secondary actions only: withdraw (disabled/permanent
// lock info), unstake, and the two keeper calls.
export function TerminalModals({
  activeModal, onClose, position, stats, epoch, gauges, timeToVoteOpen,
  onWithdraw, onUnstake, onCastVotes, onHarvest,
}: TerminalModalsProps) {
  return (
    <>
      <WithdrawModal
        isOpen={activeModal === 'withdraw'}
        onClose={onClose}
        tokenIds={position.veMezoTokenIds}
        onWithdraw={onWithdraw}
      />
      <UnstakeModal
        isOpen={activeModal === 'unstake'}
        onClose={onClose}
        stakedBalance={position.stakedBalance}
        onUnstake={onUnstake}
      />
      <CastVotesModal
        isOpen={activeModal === 'castVotes'}
        onClose={onClose}
        totalPower={stats.totalVotingPower}
        gauges={gauges}
        epochVoted={epoch.epochVoted}
        timeUntilNextVote={timeToVoteOpen}
        onCastVotes={onCastVotes}
      />
      <HarvestModal
        isOpen={activeModal === 'harvest'}
        onClose={onClose}
        pendingIncentives={stats.pendingIncentives}
        bountyBps={stats.bountyBps}
        epochVoted={epoch.epochVoted}
        epochHarvested={epoch.epochHarvested}
        bribesClaimed={epoch.claimBribesReady}
        claimCursor={epoch.claimBribesCursor}
        claimTotal={epoch.claimBribesTotal}
        onHarvest={onHarvest}
      />
    </>
  );
}

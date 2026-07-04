import React from 'react';
import {
  DepositModal,
  WithdrawModal,
  StakeModal,
  UnstakeModal,
  ClaimModal,
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
  liveCountdown: number;
  onUnlockPermanent: (tokenId: number) => Promise<void>;
  onDeposit: (tokenId: number) => Promise<void>;
  onWithdraw: (tokenId: number) => Promise<void>;
  onStake: (amount: string) => Promise<void>;
  onCheckAllowance: (amount: string) => Promise<boolean>;
  onApprove: (amount: string) => Promise<void>;
  onUnstake: (amount: string) => Promise<void>;
  onClaim: () => Promise<void>;
  onCastVotes: () => Promise<void>;
  onHarvest: () => Promise<void>;
}

export function TerminalModals({
  activeModal, onClose, position, stats, epoch, gauges, liveCountdown,
  onUnlockPermanent, onDeposit, onWithdraw, onStake, onCheckAllowance, onApprove,
  onUnstake, onClaim, onCastVotes, onHarvest,
}: TerminalModalsProps) {
  return (
    <>
      <DepositModal
        isOpen={activeModal === 'deposit'}
        onClose={onClose}
        permanentIds={position.permanentIds}
        onUnlockPermanent={onUnlockPermanent}
        tokenIds={position.veMezoTokenIds}
        lockedAmounts={position.lockedAmounts}
        onDeposit={onDeposit}
      />
      <WithdrawModal
        isOpen={activeModal === 'withdraw'}
        onClose={onClose}
        tokenIds={position.veMezoTokenIds}
        onWithdraw={onWithdraw}
      />
      <StakeModal
        isOpen={activeModal === 'stake'}
        onClose={onClose}
        veByndBalance={position.veByndBalance}
        avgApr={stats.avgApr}
        rewardTokenSymbol={stats.rewardTokenSymbol}
        onStake={onStake}
        onCheckAllowance={onCheckAllowance}
        onApprove={onApprove}
      />
      <UnstakeModal
        isOpen={activeModal === 'unstake'}
        onClose={onClose}
        stakedBalance={position.stakedBalance}
        onUnstake={onUnstake}
      />
      <ClaimModal
        isOpen={activeModal === 'claim'}
        onClose={onClose}
        claimableMUSD={position.claimableMUSD}
        claimableMEZO={position.claimableMEZO}
        onClaim={onClaim}
      />
      <CastVotesModal
        isOpen={activeModal === 'castVotes'}
        onClose={onClose}
        totalPower={stats.totalVotingPower}
        gauges={gauges}
        epochVoted={epoch.epochVoted}
        timeUntilNextVote={liveCountdown}
        onCastVotes={onCastVotes}
      />
      <HarvestModal
        isOpen={activeModal === 'harvest'}
        onClose={onClose}
        pendingIncentives={stats.pendingIncentives}
        bountyBps={stats.bountyBps}
        epochVoted={epoch.epochVoted}
        epochHarvested={epoch.epochHarvested}
        onHarvest={onHarvest}
      />
    </>
  );
}

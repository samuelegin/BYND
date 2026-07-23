export interface WalletState {
  address: string | null;
  connected: boolean;
  chainId: number | null;
  balance: string;
}

export interface UserPosition {
  veMezoTokenIds: number[];
  lockedAmounts: Record<number, string>; // tokenId → locked MEZO amount
  permanentIds: number[];               // subset of veMezoTokenIds with isPermanent=true
  veByndBalance: string;
  stakedBalance: string;
  // Generic across every registered reward token (populated from
  // ByNdStaking.claimableAll(user)) — replaces the old hardcoded
  // claimableMUSD/claimableMEZO fields, which assumed exactly two tokens.
  claimableRewards: { token: string; symbol: string; amount: string }[];
}

export interface EpochState {
  // Our contract's internal epoch counter — increments once per harvest
  // cycle, used only to key epochVoted/epochHarvested/etc. lookups.
  currentEpoch: number;
  // Mezo's real global epoch number — a new epoch starts every Thursday
  // 00:00 UTC, independent of our contract's internal counter.
  displayEpoch: number;
  // Seconds until the 4-hour vote window opens (what actually gates
  // optimiseAndVote()).
  timeUntilNextVote: number;
  // Seconds until the epoch itself ends — the vote window is the last
  // 4 hours of this.
  epochEndsIn: number;
  epochVoted: boolean;
  epochHarvested: boolean;
  epochLocksExtended: boolean;
  lastVoteTimestamp: number;
  epochDuration: number;
  // Absolute unix timestamps read directly from BoostVoter.epochNext()/
  // epochStart() on Matsnet — Mezo's real Thursday 00:00 UTC boundaries.
  // Used for WAT display only; do NOT use these to gate optimiseAndVote(),
  // since the contract itself gates on its own lastVoteTimestamp clock,
  // which can drift from this.
  mezoEpochEndsAt: number;
  mezoVoteWindowOpensAt: number;
  // true when BynD's own on-chain vote-window clock (lastVoteTimestamp +
  // epochDuration - voteWindow) disagrees with Mezo's real epoch boundary
  // by more than an hour — i.e. optimiseAndVote() will actually unlock at
  // a different time than the "real Mezo" times shown above.
  clockDrifted: boolean;
  // Real on-chain extendLocks() cooldown (ByNdVault: 7 days from
  // lastExtendTimestamp), independent of the per-epoch epochLocksExtended
  // flag — a call can be blocked by this even when epochLocksExtended is
  // false for the current epoch.
  extendCooldownEndsAt: number;
  canExtendLocks: boolean;
}

export interface ProtocolStats {
  totalVotingPower: string;
  tvl: string;
  veByndSupply: string;
  totalStaked: string;
  bountyBps: number;
  pendingIncentives: string;
  rewardTokenSymbol: string;  // symbol of the first reward token (e.g. 'MUSD')
  activeStakers: number;
  avgApr: string;
  boostEfficiency: number;
}

export interface GaugeAllocation {
  gauge: string;
  name: string;
  weightBps: number;
  apr: string;
  pendingMUSD: string;
  boostedVeBTC?: string;
}

export interface EpochHistoryEntry {
  epoch: number;
  votingPower: string;
  musdHarvested: string;
  mezoHarvested: string;
  bounty: string;
  timestamp: number;
}

export interface TxStatus {
  type: 'loading' | 'success' | 'error' | null;
  message: string | null;
  hash?: string;
}

export type ModalType =
  | 'connect'
  | 'deposit'
  | 'withdraw'
  | 'stake'
  | 'unstake'
  | 'claim'
  | 'approve'
  | 'castVotes'
  | 'harvest'
  | 'extendLocks'
  | 'setGauges'
  | null;

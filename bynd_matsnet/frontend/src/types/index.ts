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
  claimableMUSD: string;
  claimableMEZO: string;
}

export interface EpochState {
  currentEpoch: number;
  timeUntilNextVote: number;
  epochVoted: boolean;
  epochHarvested: boolean;
  epochLocksExtended: boolean;
  lastVoteTimestamp: number;
  epochDuration: number;
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

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
  expiredIds: number[];                 // subset of veMezoTokenIds with end <= now and not permanent — vault will reject these until extended
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
  // Seconds until the vote window opens (what actually gates
  // optimiseAndVote()).
  timeUntilNextVote: number;
  // Seconds until the epoch itself ends — the vote window is the last
  // `voteWindow` seconds of this.
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
  // Wall-clock target timestamps (now + on-chain relative offset) that
  // timeUntilNextVote/epochEndsIn are ticked down against client-side.
  // These are intentionally NOT re-derived as raw "seconds remaining"
  // straight from chain on every poll — see the tick effect in
  // useProtocol.ts for why. 0 = not yet known.
  voteOpensAtAbs: number;
  epochEndsAtAbs: number;
  // true when BynD's own on-chain vote-window clock (lastVoteTimestamp +
  // epochDuration - voteWindow) disagrees with Mezo's real epoch boundary
  // by more than an hour — i.e. optimiseAndVote() will actually unlock at
  // a different time than the "real Mezo" times shown above.
  clockDrifted: boolean;
  // extendLocks() is gated two ways, both enforced on-chain:
  //   1. a time window — the last `extendWindow` seconds before Mezo's epoch
  //      boundary (default 24h, so it contains the 3h vote window), and
  //   2. once per epoch — only the first caller is credited a keeper slot,
  //      so later callers are rejected instead of burning gas for nothing.
  // extendWindow == 0 disables (1) only; (2) always applies.
  extendWindow: number;
  extendWindowOpensAt: number;
  timeUntilExtendWindow: number;
  canExtendLocks: boolean;
  // claimBribesBatch() progress for the current epoch.
  // readyToHarvest = epochSnapshotTaken && cursor >= total (mirrors on-chain).
  claimBribesCursor: number;
  claimBribesTotal: number;
  claimBribesReady: boolean;
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
  // Governance-set fee (ByNdVoter.protocolFeeBps) taken off the top before
  // the staker split. Defaults to 0 until governance sets it on-chain.
  protocolFeeBps: number;
}

export interface GaugeBribe {
  token: string;
  symbol: string;
  // Already scaled by the token's own decimals — never assume 18.
  amount: string;
}

export interface GaugeAllocation {
  gauge: string;
  bribe: string;         // Mezo BoostVoter bribe contract address for this gauge
  name: string;
  weightBps: number;
  apr: string;
  pendingMUSD: string;
  boostedVeBTC?: string;
  // Per-token bribes posted on this gauge for the current epoch, read from the
  // gauge's own bribe contract via tokenRewardsPerEpoch() — the same source
  // ByNdVoter ranks on, so the UI can't disagree with the contract's pick.
  // Undefined until those reads resolve; empty means nothing is posted.
  //
  // Deliberately NOT a single number: bribes come in different tokens, and
  // 100 MUSD is not 100 BTC. Summing them would be meaningless, so they are
  // listed separately with their symbols.
  bribes?: GaugeBribe[];
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

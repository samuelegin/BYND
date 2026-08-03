import type { GaugeAllocation, EpochHistoryEntry } from '@/types';
import { MATSNET_CHAIN_ID } from '@/lib/passport';

export { MATSNET_CHAIN_ID };
export const SUPPORTED_CHAIN_IDS = [MATSNET_CHAIN_ID];

// ── Addresses ─────────────────────────────────────────────────────────────
const MATSNET_ADDRESSES = {
  ByNdVault:   (import.meta.env.VITE_MATSNET_VAULT    ?? '') as `0x${string}`,
  ByNdStaking: (import.meta.env.VITE_MATSNET_STAKING  ?? '') as `0x${string}`,
  ByNdVoter:   (import.meta.env.VITE_MATSNET_VOTER    ?? '') as `0x${string}`,
  VeBYND:      (import.meta.env.VITE_MATSNET_VEBYND   ?? '') as `0x${string}`,
  VeMEZO:      (import.meta.env.VITE_MATSNET_VEMEZO   ?? '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b') as `0x${string}`,
};

export function getAddresses(_chainId?: number) {
  return MATSNET_ADDRESSES;
}

export function isDeployed(addr: string | undefined): boolean {
  return !!addr && addr !== '' && addr !== '0x0000000000000000000000000000000000000000';
}

export const EMPTY_GAUGES: GaugeAllocation[] = [];
export const EMPTY_EPOCH_HISTORY: EpochHistoryEntry[] = [];

// ── ABIs ──────────────────────────────────────────────────────────────────

export const VAULT_ABI = [
  { name: 'deposit',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  // Every deposit after the first gets merged into a single canonical veMEZO
  // NFT (see canonicalTokenId), so extendLocks()/claimRebases() no longer
  // take a tokenIds argument at all — the vault just processes whatever it's
  // currently managing (almost always just the canonical NFT) itself.
  { name: 'extendLocks',         type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'claimRebases',        type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalVotingPower',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalLockedMEZO',     type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalPendingRebase',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalDeposited',      type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getUserTokens',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'getAllTokenIds',      type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'canonicalTokenId',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // tokensNeedingExtend() was a paging helper for an O(n) batch that no
  // longer exists post-consolidation — removed.
  //
  // lastExtendTimestamp() used to be declared here and read in useProtocol's
  // multicall to drive a 7-day "extend cooldown" timer. It never existed on
  // the deployed ByNdVault, so that read silently failed and the timer was
  // fiction. extendLocks() now has a real on-chain gate instead — a time
  // window plus once-per-epoch — read from ByNdVoter.extendWindow() /
  // extendWindowOpen() / epochLocksExtended() below.
] as const;

export const STAKING_ABI = [
  { name: 'stake',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'unstake',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  // claimAll: claims all reward tokens in one tx — this is the ONLY claim
  // function on v2. claimRewards()/claimableMUSD() from v1 no longer exist.
  { name: 'claimAll',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    name: 'notifyRewardAmount', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  { name: 'stakedBalance',    type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],     outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalStaked',      type: 'function', stateMutability: 'view', inputs: [],                                  outputs: [{ name: '', type: 'uint256' }] },
  // claimable: per-token claimable balance — replaces v1's claimableMUSD,
  // now requires the token address since v2 supports multiple reward tokens.
  {
    name: 'claimable', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }, { name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // claimableAll: every pending reward across every registered token in one call
  {
    name: 'claimableAll', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'tokens',  type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
  },
  { name: 'rewardTokenCount', type: 'function', stateMutability: 'view', inputs: [],                                  outputs: [{ name: '', type: 'uint256' }] },
  { name: 'rewardTokens',     type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }],     outputs: [{ name: '', type: 'address' }] },
] as const;

export const VOTER_ABI = [
  // castVotes() was renamed to optimiseAndVote() in v2 — it now also falls
  // back to auto-selecting the best live gauge if governance hasn't
  // configured one explicitly (see setGauges below).
  { name: 'optimiseAndVote',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'harvestAndDistribute', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'markLocksExtended',    type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'currentEpoch',         type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochDuration',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'voteWindow',           type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // extendWindow: how long before the epoch boundary extendLocks() opens
  // (default 24h; 0 disables the time gate). There is deliberately no
  // timeUntilExtendWindow() view on-chain — ByNdVoter is close to the
  // EIP-170 size limit, so the countdown is derived client-side as
  // `epochNext(now) - extendWindow`, the same way the vote window already is.
  { name: 'extendWindow',         type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'extendWindowOpen',     type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { name: 'bountyBps',            type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // protocolFeeBps: new in v2, the fee taken off the top before the staker
  // split. Not yet displayed anywhere in the UI — worth surfacing.
  { name: 'protocolFeeBps',       type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'timeUntilNextVote',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'lastVoteTimestamp',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getGaugeCount',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    // Second return value is a value-WEIGHTED score, not a token amount: each
    // gauge's bribes are summed across every valued token after scaling by
    // that token's governance-set bps weight. Denominated in the reference
    // token (the one weighted 10000 bps), so 100 of a token worth 5x beats
    // 400 of the reference.
    name: 'previewOptimalGauge', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'bestGauge', type: 'address' },
      { name: 'bestScore', type: 'uint256' },
    ],
  },
  // The tokens the ranking prices, and their bps weights. 10000 bps == 1x ==
  // the reference token. A token with no weight scores zero and is ignored.
  { name: 'getValuedTokenCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'valuedTokens',        type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }],  outputs: [{ name: '', type: 'address' }] },
  { name: 'tokenWeights',        type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],  outputs: [{ name: '', type: 'uint256' }] },
  { name: 'bribeReferenceToken', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'epochVoted',           type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochHarvested',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochLocksExtended',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'minHarvestThreshold',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'gauges', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    // Solidity auto-generated getters omit dynamic-array fields from structs,
    // so the real Gauge.tokens[] field is NOT part of this return tuple —
    // this 4-value shape is correct, not a simplification.
    outputs: [
      { name: 'gauge',     type: 'address' },
      { name: 'bribe',     type: 'address' },
      { name: 'name',      type: 'string'  },
      { name: 'weightBps', type: 'uint256' },
    ],
  },
] as const;

export const VEMEZO_ABI = [
  { name: 'balanceOf',           type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner',   type: 'address' }],                                             outputs: [{ name: '', type: 'uint256' }] },
  { name: 'ownerOf',             type: 'function', stateMutability: 'view',       inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [{ name: '', type: 'address' }] },
  { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],           outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],             outputs: [] },
  { name: 'locked',              type: 'function', stateMutability: 'view',       inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [{ name: 'amount', type: 'int128' }, { name: 'end', type: 'uint256' }, { name: 'isPermanent', type: 'bool' }] },
  { name: 'unlockPermanent',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [] },
  { name: 'increaseUnlockTime',  type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newEndTime', type: 'uint256' }],  outputs: [] },
] as const;

export const ERC20_ABI = [
  { name: 'balanceOf',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],                                           outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],      outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'symbol',      type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'string' }] },
  // decimals: needed to format bribe amounts correctly. Do NOT assume 18 —
  // Mezo's bribe tokens are mixed (MUSD is 18dp, but BTC-denominated ones are
  // not), and formatting a non-18dp amount with formatEther silently shows a
  // number that is orders of magnitude wrong.
  { name: 'decimals',    type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'uint8' }] },
] as const;

// ── Mezo bribe / reward contract ────────────────────────────────────────────
// Every gauge has its OWN bribe contract instance, which is why one gauge can
// hold several different tokens' bribes at once. tokenRewardsPerEpoch(token,
// epochStart) is the per-token amount posted for that epoch — the same source
// ByNdVoter's gauge ranking reads, so the UI and the contract agree on what a
// gauge is worth.
export const BRIBE_ABI = [
  {
    name: 'tokenRewardsPerEpoch', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }, { name: 'epochStart', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ── Matsnet BoostVoter ABI ──────────────────────────────────────────────────
// Confirmed live on explorer (read_proxy) + hardhat probe against
// 0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1 on 2026-07-22: periodFinish,
// activePeriod, epochVoteEnd, EPOCH_DURATION do NOT exist on this contract
// (all reverted). The real functions are epochStart(timestamp) and
// epochNext(timestamp) — pure Velodrome-style calendar math, no stored
// counter: epochStart(t) = t - (t % WEEK), epochNext(t) = epochStart(t) + WEEK.
export const BOOST_VOTER_ABI = [
  { name: 'epochStart', type: 'function', stateMutability: 'view', inputs: [{ name: '_timestamp', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochNext',  type: 'function', stateMutability: 'view', inputs: [{ name: '_timestamp', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  // Confirmed live via scripts/fund-bribe.js: BoostVoter.claimable(gauge)
  // returns the bribe amount currently sitting on that gauge, ready to be
  // voted for and harvested — this is what's shown as "Bribes" per gauge.
  { name: 'claimable',  type: 'function', stateMutability: 'view', inputs: [{ name: '_gauge', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const BOOST_VOTER_ADDRESS = '0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1' as const;

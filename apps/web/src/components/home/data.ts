import { Radio, Gift, Percent } from 'lucide-react';

export const TABS = [
  { key: 'boost', label: 'Boost cycle' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'keeper', label: 'Keeper bounties' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export const STEPS: Record<TabKey, { num: number; title: string; body: string }[]> = {
  boost: [
    {
      num: 1,
      title: 'Deposit veMEZO',
      body: 'Lock or deposit veMEZO and Bynd folds it into one permanent, aggregated position — no more stranded, fragmented locks.',
    },
    {
      num: 2,
      title: 'Route to gauges',
      body: 'The combined boost block votes as one, steering weight to the highest-yielding gauges every epoch.',
    },
    {
      num: 3,
      title: 'Mint veBYND',
      body: 'You receive liquid veBYND, an ERC-20 claim on the pooled boost and rewards. Stake, trade, or exit anytime.',
    },
  ],
  rewards: [
    {
      num: 1,
      title: 'Capture emissions',
      body: 'Aggregated boost reaches gauge emissions a solo veMEZO lock never could, then passes them straight to stakers.',
    },
    {
      num: 2,
      title: 'Collect bribes',
      body: 'Protocols bribe the block for its votes, and those bribes route back to veBYND stakers in any ERC-20.',
    },
    {
      num: 3,
      title: 'Claim or compound',
      body: 'Rewards stream continuously. Claim them to your wallet, or compound into more veBYND for a bigger share.',
    },
  ],
  keeper: [
    {
      num: 1,
      title: 'Permissionless upkeep',
      body: 'Anyone can trigger the epoch voting, harvest, and distribution jobs. No privileged operator required.',
    },
    {
      num: 2,
      title: 'Earn a bounty',
      body: 'Every successful keeper call pays a bounty from protocol fees — maintenance that pays for itself.',
    },
    {
      num: 3,
      title: 'Always on time',
      body: 'Bounties keep boosts routing and rewards flowing on schedule, epoch after epoch.',
    },
  ],
};

export const REVENUE_STREAMS = [
  {
    icon: Radio,
    title: 'Boosted emissions',
    body: 'Aggregated boost earns a bigger share of gauge emissions than any single veMEZO lock could reach alone.',
    tag: 'Emissions',
  },
  {
    icon: Gift,
    title: 'Vote bribes',
    body: 'Protocols pay the block to direct its votes. Every bribe, in any ERC-20, is collected and passed through.',
    tag: 'Bribes',
  },
  {
    icon: Percent,
    title: 'Protocol fees',
    body: 'A slice of mint, swap, and exit fees on veBYND flows back to long-term stakers.',
    tag: 'Fees',
  },
];

export const COMPARE = [
  { dim: 'Boost share', solo: 'Fragmented', bynd: 'Dominant block' },
  { dim: 'Liquidity', solo: 'Locked to expiry', bynd: 'Exit anytime' },
  { dim: 'Gauge routing', solo: 'Manual, per epoch', bynd: 'Auto-routed' },
  { dim: 'Bribe demand', solo: 'Rarely courted', bynd: 'Bid to attract' },
  { dim: 'Epoch upkeep', solo: 'Self-managed', bynd: 'Keeper-run' },
];

export const EPOCH_STEPS = [
  { num: 1, fn: 'vote()', note: "Casts the aggregated boost across the epoch's highest-yielding gauges." },
  { num: 2, fn: 'harvest()', note: 'Pulls in emissions and bribes from every voted gauge.' },
  { num: 3, fn: 'distribute()', note: 'Streams collected rewards out to veBYND stakers.' },
  { num: 4, fn: 'relock()', note: 'Extends the veMEZO lock so the boost block stays permanent.' },
];

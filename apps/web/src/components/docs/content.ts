import {
  Layers, Lock, Coins, Vote, RefreshCw, Wallet, ArrowRightLeft,
  Wrench, FileText, SlidersHorizontal, HelpCircle, BookOpen,
} from 'lucide-react';
import type { DocGroup } from './types';
import { h2, h3, p, list, steps, callout, table, kv } from './types';

export const DOCS_NAV: DocGroup[] = [
  {
    label: 'Getting started',
    pages: [
      {
        slug: 'introduction',
        title: 'Introduction',
        description: 'What BynD is, and why locked veMEZO benefits from pooling.',
        blocks: [
          p('BynD coordinates veMEZO that would otherwise sit fragmented across many holders. A veMEZO holder deposits once and receives veBYND, a tradeable token that tracks their claim on the pooled position.'),
          p('From there, BynD keeps the locked positions active, refreshes them weekly, and routes the group\'s combined boost to the veBTC positions with the strongest rewards. Holders do not have to remember weekly votes, chase every opportunity by hand, or be stuck in their position with no exit.'),
          p('BynD turns scattered boost power into a shared block that can move with more weight. veMEZO holders get a simpler way to participate, and veBTC holders get a clearer market for attracting boost.'),
          callout('success', 'BynD placed 2nd in the Mezo Utilization track. Full project details are in the [BynD GitHub repository](https://github.com/samuelegin/BYND).'),
          h2('how-it-fits', 'How the pieces fit together'),
          p('Four contracts do the work. **ByNdVault** holds the veMEZO NFTs and mints veBYND, **ByNdVoter** routes votes and harvests rewards, **ByNdStaking** pays those rewards out to anyone staking veBYND, and **VeBYND** is the liquid ERC-20 itself. The next few pages walk through each one, starting with Quickstart if you just want to try it, or Protocol Overview if you want the full mental model first.'),
        ],
      },
      {
        slug: 'quickstart',
        title: 'Quickstart',
        description: 'Connect a wallet, lock veMEZO, and mint veBYND in under five minutes.',
        blocks: [
          p('This walks through the exact flow in the Terminal: locking a veMEZO NFT and minting veBYND against it.'),
          steps([
            { title: 'Connect your wallet', body: 'Open the Terminal and click **Connect passport**. BynD runs on Mezo Matsnet (testnet, chain ID `31611`), you\'ll be prompted to switch networks if you\'re on the wrong one.' },
            { title: 'Wait for the scan', body: 'The Terminal scans your wallet for veMEZO NFTs it owns. Because Mezo\'s veMEZO contract doesn\'t implement `ERC721Enumerable`, this is a direct `ownerOf()` scan across the token ID range rather than an indexed lookup. It takes a couple of seconds.' },
            { title: 'Pick an NFT to lock', body: 'If you own more than one eligible veMEZO NFT, select which one to deposit from the dropdown. Locks that are already permanently locked or expired on Mezo\'s side are flagged. See Lock & Mint for how to resolve those.' },
            { title: 'Review and confirm', body: 'The confirm modal shows the exact breakdown: voting power, mint rate (always 1:1), lock duration, and the veBYND amount you\'ll receive. Confirming calls `ByNdVault.deposit(tokenId)`.' },
            { title: 'Stake it (optional)', body: 'Once veBYND lands in your wallet, Step 2 lets you stake it into ByNdStaking to start earning a share of harvested gauge emissions and bribes. You can also just hold or trade it.' },
          ]),
          callout('warning', 'Depositing is permanent and one-way at the protocol level. BynD doesn\'t unlock veMEZO back out. If you need liquidity later, exit by trading veBYND on the veBYND/MEZO pool rather than trying to withdraw the original NFT.'),
        ],
      },
    ],
  },
  {
    label: 'Core concepts',
    pages: [
      {
        slug: 'overview',
        title: 'Protocol overview',
        description: 'The four contracts, and how a deposit flows through all of them.',
        blocks: [
          p('BynD is four contracts working together, all deployed as **UUPS upgradeable proxies** on Mezo Matsnet.'),
          table(
            ['Contract', 'Role'],
            [
              ['`ByNdVault`', 'Holds deposited veMEZO NFTs in custody, mints veBYND 1:1 against them, and keeps the underlying locks extended and compounding.'],
              ['`ByNdVoter`', 'Casts the vault\'s combined voting power toward gauges, then harvests and distributes whatever those gauges earn.'],
              ['`ByNdStaking`', 'Pays out harvested rewards to anyone staking veBYND, across any number of ERC-20 reward tokens.'],
              ['`VeBYND`', 'The liquid ERC-20 minted 1:1 per veMEZO locked. Freely transferable. This is what gives depositors liquidity.'],
            ],
          ),
          h2('deposit-flow', 'What happens when you deposit'),
          steps([
            { title: 'You call `ByNdVault.deposit(tokenId)`', body: 'The vault takes custody of your veMEZO NFT and mints you veBYND equal to the MEZO amount locked under it.' },
            { title: 'Your voting power joins the pool', body: 'The locked MEZO now counts toward the vault\'s `totalVotingPower` and `totalLockedMEZO`, pooled with every other depositor\'s.' },
            { title: 'Each epoch, the pool votes as one', body: '`ByNdVoter.optimiseAndVote()` routes that combined power toward the best-yielding veBTC gauges, something no single small lock could meaningfully influence alone.' },
            { title: 'Gauges pay emissions and bribes', body: '`harvestAndDistribute()` sweeps whatever ERC-20 tokens those gauges paid out: emissions from Mezo, plus any bribes other protocols offered for BynD\'s vote, and routes them to stakers.' },
            { title: 'Stakers claim their share', body: 'Anyone with veBYND staked in `ByNdStaking` can call `claimAll()` to collect their share of every reward token harvested so far.' },
          ]),
        ],
      },
      {
        slug: 'vemezo',
        title: 'veMEZO & the boost block',
        description: 'What veMEZO is, and what "pooling" actually means on-chain.',
        blocks: [
          p('veMEZO is Mezo\'s vote-escrow token. You lock MEZO for up to 4 years and receive a non-fungible position (an NFT, not an ERC-20) representing that lock. The longer and larger the lock, the more voting power it carries, and that power decays as the lock approaches expiry unless extended.'),
          h2('nft-not-token', 'It\'s an NFT, not a balance'),
          p('Each veMEZO lock is its own ERC-721 token with its own ID, amount, and expiry. Mezo\'s VotingEscrow contract doesn\'t implement `ERC721Enumerable`, so there\'s no `tokenOfOwnerByIndex()` to cheaply list what a wallet owns. BynD\'s frontend discovers your NFTs by scanning `ownerOf()` across the live token ID range in batches. That scan is exactly what the mascot loading carousel in the Terminal is covering for.'),
          h2('boost-block', 'The "boost block"'),
          p('Once multiple veMEZO NFTs are deposited into `ByNdVault`, they don\'t stay as separate positions. Every deposit after the first is merged into a single canonical veMEZO NFT (`ByNdVault.canonicalTokenId`) via veMEZO\'s own `merge()` function, folding its locked amount in and burning the incoming NFT. That single position is what carries the pool\'s entire voting power, and it\'s what `ByNdVoter` casts as one block every epoch. That consolidation is the entire thesis: gauges and bribe markets respond to how much power shows up at once, and a single, ever-growing position reaches influence that fragmented, individually-managed locks rarely do — and it means voting, claiming bribes, and extending the lock all cost the same in gas whether 10 people have deposited or 10,000.'),
          callout('info', 'Deposited veMEZO NFTs are also kept from expiring automatically. `ByNdVault.extendLocks()` is permissionless and takes no arguments — any keeper can call it once per epoch, in the final 24h before the epoch boundary, to push the pool\'s lock(s) back out to the max 4-year duration. In the rare case a deposit can\'t be merged (e.g. it already voted elsewhere this epoch, or is itself an unvested grant NFT), the deposit still succeeds and still mints veBYND — the NFT is just kept as a separately-managed straggler, and a `MergeFailedFallback` event records it.'),
          callout('info', 'Consolidation applies from the deposit that follows the first one, so positions deposited **before** the canonical-merge logic existed are not retro-merged — there is no backfill. On the current Matsnet deployment that means five NFTs are still tracked individually alongside the canonical one, while every new deposit merges cleanly into it. It costs a little more gas per epoch than the ideal, and nothing else: correctness, rewards, and voting are unaffected.'),
        ],
      },
      {
        slug: 'vebynd',
        title: 'veBYND',
        description: 'The liquid token you receive, and how it differs from the locked position underneath it.',
        blocks: [
          p('veBYND is an ordinary ERC-20: no lock, no expiry, no vote-escrow decay. You receive it 1:1 against the MEZO amount locked under whatever veMEZO NFT you deposit, and from that point on it behaves like any other token: hold it, stake it, or trade it.'),
          kv([
            { label: 'Mint rate', value: '1:1 veBYND per MEZO locked' },
            { label: 'Standard', value: 'ERC-20 (fully transferable)' },
            { label: 'Backing', value: 'Permanently-locked veMEZO NFTs held by ByNdVault' },
            { label: 'Protocol-level redemption', value: 'None (see below)' },
          ]),
          h2('exit', 'How to exit'),
          p('BynD never unlocks the underlying veMEZO back to you. The deposit is one-way at the protocol level, and the vault itself relocks the position toward the maximum 4-year duration as it goes. This is the same trade every liquid-wrapper protocol makes: what you get in exchange is a token that\'s liquid **immediately**, rather than a position that\'s liquid only once its original lock finally expires.'),
          p('To exit a position, trade veBYND for MEZO on the veBYND/MEZO liquidity pool, seeded at launch. Price will track the pool\'s depth and the market\'s view of BynD\'s yield.'),
        ],
      },
      {
        slug: 'vault-staking',
        title: 'Vault & staking',
        description: 'What ByNdVault and ByNdStaking are each responsible for.',
        blocks: [
          h2('vault', 'ByNdVault'),
          p('Custody and lock upkeep. Every deposited veMEZO NFT lives here for as long as it\'s part of the pool.'),
          table(
            ['Function', 'What it does'],
            [
              ['`deposit(tokenId)`', 'Takes custody of a veMEZO NFT and mints veBYND 1:1 to the caller. Every deposit after the first is merged into a single canonical veMEZO NFT, so the vault only ever has to manage one voting position regardless of how many people deposit.'],
              ['`extendLocks()`', 'Permissionless, no arguments. Extends the pool\'s managed lock(s) back toward the 4-year max so voting power never decays to zero. Callable once per epoch, in the final 24h before the epoch boundary — only the first caller each epoch is credited a keeper slot, so later callers are rejected instead of wasting gas.'],
              ['`claimRebases()`', 'Permissionless, no arguments, no epoch gate. Compounds any MEZO rebase accrued on the managed lock(s) directly back into them. Nothing leaves the vault.'],
              ['`totalVotingPower()` / `totalLockedMEZO()`', 'View functions returning the pool\'s current aggregated numbers.'],
              ['`canonicalTokenId()`', 'The single veMEZO NFT every deposit after the first gets merged into.'],
              ['`getUserTokens(user)` / `getAllTokenIds()`', 'Historical/current-management enumeration: `getUserTokens` records which original tokenId each user deposited (even after it\'s later merged away), while `getAllTokenIds` returns only the tokenIds still actively managed today — almost always just the canonical one.'],
            ],
          ),
          h2('staking', 'ByNdStaking'),
          p('Pays harvested rewards out to veBYND stakers using a **Synthetix-style `rewardPerToken` accumulator**, run independently per reward token, so BynD can support any number of arbitrary ERC-20 bribe tokens, not just a single hardcoded reward asset.'),
          table(
            ['Function', 'What it does'],
            [
              ['`stake(amount)` / `unstake(amount)`', 'Move veBYND in and out of the staking pool. Only staked veBYND earns rewards.'],
              ['`claimAll()`', 'Claims every registered reward token in one transaction. It\'s the only claim entrypoint in v2.'],
              ['`claimable(token, user)` / `claimableAll(user)`', 'View pending rewards for one token, or every token, without submitting a transaction.'],
              ['`rewardTokenCount()` / `rewardTokens(i)`', 'Enumerate every ERC-20 that has ever been notified as a reward. This is how the UI discovers what to display without a hardcoded token list.'],
              ['`notifyRewardAmount(token, amount)`', 'Called by `ByNdVoter.harvestAndDistribute()` to stream newly harvested rewards into the accumulator.'],
            ],
          ),
        ],
      },
      {
        slug: 'gauges-bribes',
        title: 'Gauges & bribes',
        description: 'Where the pool\'s votes go, and where reward tokens come from.',
        blocks: [
          p('A **gauge** is where votes get directed to earn emissions. In BynD\'s case, that means veBTC boost gauges on Mezo\'s Matching Market — they direct boost (1x–5x) rather than paying emissions themselves, so the yield that matters is the third-party bribe incentives posted on them. `ByNdVoter.optimiseAndVote()` casts the vault\'s entire pooled voting power toward whichever gauge (or set of gauges) is currently offering the best yield, auto-selecting a live gauge if governance hasn\'t configured one explicitly.'),
          h2('picking-the-best-gauge', 'How "best paying" is actually decided'),
          p('Bribes arrive in different tokens, so raw amounts can\'t be compared: 100 MUSD, 100 MEZO and 100 sats are three different amounts of money. Ranking gauges by whichever number happens to be largest would hand the pool\'s votes to whichever briber picked the token with the smallest unit.'),
          p('So each gauge is scored, not counted. Governance prices the bribe tokens it recognises with a per-token weight in bps (`setTokenWeights`), where 10000 bps means "one unit of this is worth one unit of the reference token" — MUSD is the reference, at 1x. For every gauge, `ByNdVoter` reads the bribes posted on that gauge\'s own bribe contract for the current epoch, scales each token\'s amount by that token\'s weight, and sums the result. The highest total wins the vote.'),
          callout('info', 'A token governance has not priced scores zero, so it can never win a vote on its own. That is deliberate: an unrecognised token is one nobody has agreed a value for, and treating it as worthless is safer than letting a briber mint an arbitrary token and win the pool\'s votes with it for free. `previewOptimalGauge()` returns the winning gauge and its score, denominated in the reference token.'),
          p('The scan is capped (`effectiveScanCap()`, 300 gauges by default) so the loop stays inside the block gas limit as Mezo\'s gauge list grows — there were already 656 live gauges on Matsnet when this was measured, enough that an uncapped scan would have reverted.'),
          h2('bribes', 'Bribes'),
          p('Protocols that want BynD\'s votes routed their way can pay for it directly, in any ERC-20 token, not just MEZO or MUSD. Those payments are called **bribes**, and `harvestAndDistribute()` sweeps them the same way it sweeps ordinary gauge emissions: whatever token arrives, it gets counted and routed to stakers via `ByNdStaking`.'),
          callout('info', 'This is why `ByNdStaking` is built to handle an arbitrary, growing list of reward tokens rather than one fixed asset. Bribe tokens aren\'t known in advance.'),
          h2('why-it-compounds', 'Why pooling helps here specifically'),
          p('Bribe markets respond to scale: a briber would rather pay one entity that controls a large, reliable block of votes than try to coordinate hundreds of small individual veMEZO holders. Pooling is what makes BynD worth bribing in the first place.'),
        ],
      },
      {
        slug: 'epochs-keepers',
        title: 'Epochs & keepers',
        description: 'The weekly cycle that keeps votes, harvests, and lock extensions on schedule.',
        blocks: [
          p('BynD runs on Mezo\'s weekly epoch cycle, which rolls over every Thursday at 00:00 UTC. Most maintenance calls are gated to run once per epoch, and the two that matter most are also gated to a time window in the run-up to that boundary. Anyone, not just a designated operator, can call any of them, which is what "keeper" means here: it\'s a role anyone can fill, not a whitelisted address.'),
          table(
            ['Call', 'Gating', 'Who benefits'],
            [
              ['`optimiseAndVote()`', 'Only callable in the final `voteWindow` (3h default) before Mezo\'s real epoch boundary; reverts if called earlier, or if already voted this epoch. The 3h stops one hour short of the boundary because Mezo\'s BoostVoter itself refuses votes in the epoch\'s last hour', 'Keeps the pool\'s votes routed to the best gauge, cast as late as possible so most of that epoch\'s bribes have already landed'],
              ['`harvestAndDistribute()`', 'Once per epoch, and only after `claimBribesBatch()` has covered every managed tokenId — it reverts otherwise', 'Pays the caller a bounty (see below)'],
              ['`claimBribesBatch(limit)`', 'No time gate and no once-per-epoch rule: it is paged, so it is called repeatedly until `claimProgress().readyToHarvest` is true. Required before harvesting', 'Pulls each managed NFT\'s bribes out of the gauges and into the voter, which is what harvest then splits'],
              ['`extendLocks()`', 'Once per epoch, and only in the final `extendWindow` (24h default) before the epoch boundary; reverts if called earlier, or if another keeper already extended this epoch', 'Keeps managed veMEZO from decaying toward expiry'],
              ['`markLocksExtended()`', 'Once per epoch — the bookkeeping half of `extendLocks()`, called by the vault itself, which is where both of those gates are enforced', 'Records which keeper won the extend slot for the epoch\'s bounty split'],
              ['`claimRebases()`', 'No epoch gate, no arguments', 'Compounds accrued MEZO rebases back into the managed lock(s)'],
            ],
          ),
          callout('info', 'Only one keeper per epoch is credited for each gated step, so the windows exist to stop everyone else from burning gas on a call that can no longer pay them. Both windows are governance-tunable, and the extend window is always at least as wide as the vote window — so a keeper can extend the locks and then vote with them in a single sitting.'),
          h2('bounty', 'The keeper bounty'),
          p('Calling `harvestAndDistribute()` pays the caller **1% of every token harvested that epoch** (`bountyBps` on `ByNdVoter`). Since it sweeps an arbitrary number of ERC-20 reward tokens in one call, the bounty is paid per-token, in whatever token was actually harvested. There\'s no separate treasury payout involved.'),
          callout('success', 'This is deliberately self-funding: the maintenance that keeps the whole system running (voting, harvesting, extending) pays for itself out of the value it captures, rather than depending on a subsidized keeper network.'),
          p('You can run these calls yourself from the Keeper page, which walks through the epoch flow in call order and shows exactly what\'s currently callable.'),
        ],
      },
    ],
  },
  {
    label: 'Guides',
    pages: [
      {
        slug: 'lock-and-mint',
        title: 'Lock & mint veBYND',
        description: 'Depositing a veMEZO NFT, including the permanent-lock and expired-lock edge cases.',
        blocks: [
          p('The Terminal\'s Step 1 card walks through locking a veMEZO NFT and minting veBYND against it. Most deposits are a straightforward select-and-confirm. This page covers the two cases that need an extra step first.'),
          h2('permanent', 'If your NFT is already permanently locked'),
          p('BynD needs to manage the lock\'s extension schedule itself, so it can\'t accept a veMEZO NFT that\'s already set to Mezo\'s own permanent-lock mode. If the picker flags an NFT this way:'),
          steps([
            { title: 'Open the confirm modal anyway', body: 'Select the flagged NFT. It\'ll show a warning banner explaining it\'s permanently locked.' },
            { title: 'Convert to a time-based lock', body: 'Click **Unlock permanent lock**. This is a one-time conversion on Mezo\'s own veMEZO contract, not on BynD.' },
            { title: 'Confirm the deposit', body: 'Once converted, the **Lock & Mint veBYND** button becomes available. From here, `ByNdVault` takes over and relocks it toward the 4-year max automatically going forward.' },
          ]),
          h2('expired', 'If your NFT\'s lock has expired'),
          p('An expired lock can\'t be deposited directly. It needs to be withdrawn and re-locked on Mezo\'s own app first, since an expired veMEZO position carries no voting power for the pool to use.'),
          callout('warning', 'Withdraw and re-lock the expired NFT on Mezo\'s app, then come back to the Terminal. The fresh lock will show up in the picker as eligible.'),
        ],
      },
      {
        slug: 'stake-and-earn',
        title: 'Stake & earn',
        description: 'Staking veBYND into ByNdStaking to start earning a share of harvested rewards.',
        blocks: [
          p('Holding veBYND alone doesn\'t earn anything. It\'s staking it into `ByNdStaking` that entitles you to a share of whatever `ByNdVoter` harvests each epoch.'),
          steps([
            { title: 'Open Step 2 in the Terminal', body: 'The Stake & Earn card shows your wallet balance and what your position looks like after staking.' },
            { title: 'Enter an amount, or hit Max', body: 'You can stake any portion of your veBYND balance. Staking isn\'t all-or-nothing.' },
            { title: 'Confirm the stake', body: 'This calls `ByNdStaking.stake(amount)`. Only the staked portion earns rewards; unstaked veBYND in your wallet is fully liquid and tradeable but earns nothing.' },
          ]),
          h2('claiming', 'Claiming rewards'),
          p('Rewards accrue continuously across every reward token the pool has ever harvested. Hitting **Claim rewards** calls `claimAll()`, which sweeps every token you\'re owed in a single transaction rather than requiring one claim per token.'),
        ],
      },
      {
        slug: 'unstake-claim',
        title: 'Unstaking & claiming',
        description: 'Getting veBYND back out of the staking pool.',
        blocks: [
          p('Unstaking is independent of claiming. You can pull veBYND back out of `ByNdStaking` at any time via `unstake(amount)` without affecting rewards you\'ve already accrued but not yet claimed.'),
          list([
            '**Unstake** returns veBYND to your wallet. It stops earning further rewards immediately, but doesn\'t forfeit anything already accrued.',
            '**Claim rewards** collects accrued rewards without touching your staked balance. You can claim repeatedly while staying staked.',
            'There\'s no lockup or cooldown on either action. Both are plain ERC-20-style operations on top of the accumulator.',
          ]),
        ],
      },
      {
        slug: 'voting',
        title: 'Voting & gauge routing',
        description: 'How the pool\'s votes get cast, and who can trigger it.',
        blocks: [
          p('Voting is fully automated and permissionless. There\'s no governance ballot to participate in per epoch. `ByNdVoter.optimiseAndVote()` does the routing itself, choosing the best-yielding veBTC gauge(s) available.'),
          steps([
            { title: 'Anyone can call it, once the window is open', body: 'Open the Keeper page and use **Cast system votes**. There\'s no special permission required, but there is a real time gate: the contract only accepts the call in the final `voteWindow` (3h by default) before Mezo\'s epoch boundary, and reverts with "vote window not open" before then. The Keeper page counts down to it. The window deliberately closes an hour before the boundary — Mezo\'s BoostVoter stops accepting votes at `epochNext - 1h`.' },
            { title: 'One successful call per epoch', body: 'A `epochVoted` flag flips true on the first successful call each epoch; repeat calls in the same epoch simply revert rather than double-voting.' },
            { title: 'If every vote fails, the call reverts', body: 'Each NFT\'s vote is attempted independently, so one bad lock can\'t block the rest — it just emits `VoteCastFailed` and the others still vote. But if **every** vote reverts, the whole call reverts with "ByNdVoter: votes not cast" and the epoch stays open. That\'s deliberate: marking the epoch voted when nothing reached a bribe contract would strand it, since bribes for an epoch can only be claimed once and harvest would then have nothing to distribute. Seeing this revert means something is genuinely wrong — most often the vault hasn\'t approved the voter on its NFTs — and you still have the rest of the window to fix it and retry.' },
            { title: 'Governance can pin specific gauges', body: 'If governance hasn\'t configured gauges via `setGauges`, the contract auto-selects the best live option instead of reverting.' },
          ]),
          callout('info', 'There\'s no separate keeper bounty for voting itself. The bounty is paid on `harvestAndDistribute()`, since that\'s the step that actually realizes value from the votes already cast.'),
        ],
      },
      {
        slug: 'running-a-keeper',
        title: 'Running a keeper',
        description: 'A practical walkthrough of the epoch flow from the Keeper page.',
        blocks: [
          p('The Keeper page exposes every permissionless maintenance call in call order, with live status on what\'s currently eligible to run. The whole run fits in the final 24h before Mezo\'s epoch boundary (Thursday 00:00 UTC), which is when the gated steps open.'),
          steps([
            { title: 'Claim rebases', body: 'Not epoch-gated, not time-gated. Run `claimRebases()` — no arguments needed — whenever convenient to compound accrued MEZO rebases back into the vault\'s managed lock(s). Doing it first means the locks you extend and vote with are already as large as possible.' },
            { title: 'Extend locks', body: 'Run `extendLocks()` — no arguments needed. It automatically pushes every currently-managed lock (almost always just the single canonical NFT) back toward the 4-year max so voting power keeps compounding instead of decaying toward expiry. This opens in the final 24h before the epoch boundary and is credited to one keeper per epoch, so call it as soon as the window opens: once someone else has done it, later calls are rejected rather than silently wasting your gas.' },
            { title: 'Cast votes', body: 'Run `optimiseAndVote()` — but only once the vote window is actually open (the final 3h before Mezo\'s epoch boundary by default). It\'ll revert if called earlier, deliberately, so votes are cast as late as possible and most of the epoch\'s bribes have already been posted before we commit to a gauge. Everything downstream depends on the pool\'s votes being current.' },
            { title: 'Claim bribes', body: 'Run `claimBribesBatch(limit)`. This is a required step, not an optional one: it takes the epoch\'s reward snapshot and pulls each managed veMEZO NFT\'s bribes out of every configured gauge\'s bribe contract. It\'s paged rather than once-per-epoch, so keep pressing until the Keeper page shows Done — the UI sends `limit = 200` (the on-chain maximum), which is a single press for any realistic pool, so the cursor is only shown when there are more than 200 NFTs and paging genuinely takes more than one call. Harvest reverts until this finishes.' },
            { title: 'Harvest & distribute', body: 'Once the bribes are claimed, call `harvestAndDistribute()`. This is the step that pays you a bounty: 1% of every token swept. It also closes the epoch out, which is what re-arms all of the above for the next one. If the claim step processed every NFT but pulled in nothing, harvest is disabled rather than offered — the on-chain gates are met, but there is genuinely nothing to distribute and the call would revert.' },
          ]),
          callout('info', 'The bounty is split across the epoch\'s keeper roles, so each of these steps is paid to whoever called it — but only the first caller of each gated step is recorded. That\'s the whole reason for the windows: without them, `extendLocks()` was callable all week and everyone who lost the race paid gas for nothing.'),
          callout('success', 'None of this requires running your own infrastructure to be useful. Even manually triggering these calls occasionally from the Keeper UI keeps the protocol healthy and earns the bounty when you\'re the one who calls `harvestAndDistribute()`.'),
        ],
      },
    ],
  },
  {
    label: 'Reference',
    pages: [
      {
        slug: 'contracts',
        title: 'Contract addresses',
        description: 'Deployed addresses on Mezo Matsnet, read live from the app\'s own configuration.',
        blocks: [
          p('BynD is currently deployed on **Mezo Matsnet** (testnet), chain ID `31611`. Addresses shown on this page are read directly from the same configuration the app itself uses at runtime.'),
        ],
      },
      {
        slug: 'parameters',
        title: 'Protocol parameters',
        description: 'Fee rates, bounty rates, and lock durations, in one place.',
        blocks: [
          kv([
            { label: 'Mint rate', value: '1:1 veBYND per MEZO locked' },
            { label: 'Max lock duration', value: '4 years' },
            { label: 'Keeper bounty', value: '1% per token harvested (`bountyBps`)' },
            { label: 'Protocol fee', value: '0% by default, governance-gated, capped at 20% (`protocolFeeBps`)' },
            { label: 'Epoch length', value: 'Weekly, aligned to Mezo\'s epoch cycle' },
            { label: 'Vote/claim/extend cost', value: 'O(1) regardless of pool size — every deposit after the first merges into one canonical veMEZO NFT' },
          ]),
          callout('info', 'The protocol fee is taken off the top before the staker split, and is currently set to 0%. It exists as a governance lever for future use, not an active charge today.'),
        ],
      },
      {
        slug: 'faq',
        title: 'FAQ',
        description: 'Common questions about locking, liquidity, and how the pool works.',
        blocks: [
          h3('f1', 'Can I get my original veMEZO NFT back?'),
          p('No, depositing is one-way at the protocol level. `ByNdVault` keeps custody and relocks the position toward the maximum duration going forward. To exit, trade veBYND for MEZO on the veBYND/MEZO liquidity pool instead.'),
          h3('f2', 'Why does the scan for my NFTs take a few seconds?'),
          p('Mezo\'s veMEZO contract doesn\'t implement `ERC721Enumerable`, so there\'s no cheap way to list what a wallet owns directly. The frontend scans `ownerOf()` across the live token ID range in batches to find yours.'),
          h3('f3', 'What if I have more than one veMEZO NFT?'),
          p('You\'ll get a dropdown to pick which one to deposit. You can deposit more than one. Just repeat the flow for each. Each deposit mints veBYND independently, 1:1 against that specific NFT\'s locked amount.'),
          h3('f4', 'Do I have to stake my veBYND?'),
          p('No. veBYND is a normal ERC-20 the moment it\'s minted: hold it, trade it, or stake it into `ByNdStaking`. Only staked veBYND earns a share of harvested rewards.'),
          h3('f5', 'What tokens can rewards come in?'),
          p('Any ERC-20. Gauge emissions and bribes both flow through `harvestAndDistribute()` regardless of token, and `ByNdStaking` tracks each one with its own reward accumulator.'),
          h3('f6', 'Who runs the keeper functions?'),
          p('Nobody exclusively. Every maintenance call (voting, harvesting, extending locks, claiming rebases) is permissionless. Anyone can call them from the Keeper page, and `harvestAndDistribute()` pays whoever calls it a 1% bounty. Extending locks and voting are each credited to the first keeper who calls them in a given epoch, and both only open in the run-up to the weekly epoch boundary — the Keeper page shows which are live right now and counts down to the rest.'),
        ],
      },
      {
        slug: 'glossary',
        title: 'Glossary',
        description: 'Terms used throughout the app and these docs.',
        blocks: [
          table(
            ['Term', 'Meaning'],
            [
              ['veMEZO', 'Mezo\'s vote-escrow NFT: MEZO locked for up to 4 years in exchange for voting power.'],
              ['veBYND', 'BynD\'s liquid ERC-20, minted 1:1 against locked MEZO. Freely tradeable, unlike veMEZO.'],
              ['Boost block', 'The pooled voting power of every veMEZO NFT deposited into `ByNdVault`, cast as one combined vote.'],
              ['Gauge', 'An on-chain destination that receives votes in exchange for emissions. BynD targets veBTC gauges.'],
              ['Bribe', 'A payment, in any ERC-20, made by a third party to influence which gauge BynD\'s votes go to.'],
              ['Epoch', 'Mezo\'s weekly accounting period, rolling over Thursday 00:00 UTC. Most BynD maintenance functions (`extendLocks`, `optimiseAndVote`, `harvestAndDistribute`) are gated to run once per epoch, and the first two only inside a window before the boundary.'],
              ['Keeper', 'Anyone who calls one of BynD\'s permissionless maintenance functions, not a whitelisted role.'],
              ['Rebase', 'MEZO that accrues on a locked veMEZO position over time, compoundable back into the lock via `claimRebases`.'],
              ['UUPS proxy', 'The upgradeable-proxy pattern all four BynD contracts are deployed behind, allowing logic upgrades without changing the contract address.'],
            ],
          ),
        ],
      },
    ],
  },
];

export const DOCS_ICONS: Record<string, any> = {
  introduction: BookOpen, quickstart: RefreshCw, overview: Layers, vemezo: Lock,
  vebynd: Coins, 'vault-staking': Wallet, 'gauges-bribes': Vote, 'epochs-keepers': RefreshCw,
  'lock-and-mint': Lock, 'stake-and-earn': Coins, 'unstake-claim': ArrowRightLeft,
  voting: Vote, 'running-a-keeper': Wrench, contracts: FileText,
  parameters: SlidersHorizontal, faq: HelpCircle, glossary: BookOpen,
};

export const ALL_DOC_PAGES = DOCS_NAV.flatMap((g) => g.pages);
export const FIRST_DOC_SLUG = DOCS_NAV[0].pages[0].slug;

export function findDocPage(slug: string | undefined) {
  return ALL_DOC_PAGES.find((pg) => pg.slug === slug);
}

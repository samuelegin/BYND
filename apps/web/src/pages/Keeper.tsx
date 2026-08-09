import { useState } from "react";
import { RefreshCw, Zap, Shield, Droplets, HandCoins } from "lucide-react";
import { SectionHeader, formatTime } from "@/components/ui";
import { CastVotesModal, HarvestModal } from "@/components/modals";
import {
  StatusOverview,
  EpochFlowSteps,
  KeeperNotes,
  type KeeperStepDef,
  type BadgeVariant,
} from "@/components/keeper";
import { useProtocol } from "@/hooks/useProtocol";
import { useWallet } from "@/hooks/useWallet";
import { useWriteContract, usePublicClient } from "wagmi";
import { getAddresses, VAULT_ABI, VOTER_ABI } from "@/lib/contracts";

// 208 weeks, not "4 years": veMEZO's cap is 345,600 seconds short of 4 * 365
// days, and asking for the round number reverts. Locks are paged 200 at a time
// from a cursor that persists across calls, so one call is not a full sweep.
const EXTEND_BLURB =
  "Pushes protocol-held veMEZO back out to veMEZO's 208-week maximum, 200 locks " +
  "per call from a cursor that resumes where the last call stopped. Locks that " +
  "are permanent or already long enough are skipped.";

export default function KeeperPage() {
  const { address, chainId } = useWallet();
  // Pass address+chainId so contractsEnabled fires and all on-chain reads execute
  const { stats, epoch, gauges, refresh } = useProtocol(address, chainId);

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks] = useState(false);
  const [claimingRebases, setClaimingRebases] = useState(false);
  const [claimingBribes, setClaimingBribes] = useState(false);

  // Epoch display + vote-window countdown now come from the shared
  // useProtocol hook — same Thursday-based global epoch number and
  // chain-verified timing used on the Terminal page. This used to be a
  // separate local calendar calculation here, which could drift out of
  // sync with the epoch.timeUntilNextVote value the CastVotesModal below
  // actually gates on.
  // Countdown ticking now happens centrally inside useProtocol, so every
  // page (Terminal, Keeper, Analytics) reads the same live-updating clock —
  // no local timer needed here anymore.
  const mezoEpoch = epoch.displayEpoch;
  const liveCountdown = epoch.epochEndsIn;
  const timeToVoteOpen = epoch.timeUntilNextVote;

  const addrs = getAddresses(chainId ?? 31611);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const withTx = async (fn: () => Promise<`0x${string}`>) => {
    const hash = await fn();
    await publicClient?.waitForTransactionReceipt({ hash });
    setTimeout(refresh, 1500);
  };

  const handleClaimRebases = async () => {
    setClaimingRebases(true);
    try {
      await withTx(async () => {
        // Every deposit after the first gets merged into a single canonical
        // veMEZO NFT (see ByNdVault.canonicalTokenId), so claimRebases() no
        // longer takes a tokenIds argument — it just processes whatever it's
        // currently managing itself. No pre-fetch needed anymore.
        return writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "claimRebases",
          args: [],
        });
      });
    } finally {
      setClaimingRebases(false);
    }
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    try {
      await withTx(async () => {
        // Same as claimRebases() above — no tokenIds argument needed
        // post-consolidation.
        //
        // ByNdVault.extendLocks() already calls voter.markLocksExtended()
        // internally as msg.sender == vault — a separate frontend call to
        // markLocksExtended() would always revert, since ByNdVoter requires
        // msg.sender == vault and a user's wallet is never that address.
        return writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "extendLocks",
          args: [],
        });
      });
    } finally {
      setExtendingLocks(false);
    }
  };

  const handleCastVotes = async () => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdVoter,
        abi: VOTER_ABI,
        // v2 renamed castVotes() to optimiseAndVote() — it also falls back
        // to auto-selecting the best live gauge if governance hasn't
        // configured one explicitly, so this button works even before
        // setGauges() has ever been called.
        functionName: "optimiseAndVote",
        args: [],
      }),
    );
  };

  const handleClaimBribes = async () => {
    setClaimingBribes(true);
    try {
      await withTx(() =>
        writeContractAsync({
          address: addrs.ByNdVoter,
          abi: VOTER_ABI,
          functionName: "claimBribesBatch",
          // MAX_CLAIM_BATCH on-chain is 200 — one tx covers any realistic
          // managedTokenIds count. If the protocol ever holds more than 200
          // NFTs, this button just needs pressing again until Done.
          args: [200n],
        }),
      );
    } finally {
      setClaimingBribes(false);
    }
  };

  const handleHarvest = async () => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdVoter,
        abi: VOTER_ABI,
        functionName: "harvestAndDistribute",
        args: [],
      }),
    );
  };

  const canClaimRebases = true;
  // extendLocks() has a real on-chain gate on BOTH counts, so check both:
  //   - a time window (last `extendWindow` secs before the epoch boundary,
  //     24h by default), and
  //   - once per epoch — only the first caller is credited a keeper slot, so
  //     the vault rejects later callers instead of letting them waste gas.
  // canExtendLocks from useProtocol already ANDs these together.
  const canExtend = epoch.canExtendLocks;
  const extendWindowOpen = epoch.timeUntilExtendWindow <= 0;
  // optimiseAndVote() DOES have a real on-chain time gate — it only opens
  // in the final `voteWindow` seconds before Mezo's real epoch boundary
  // (see ByNdVoter.sol's require on boostVoter.epochNext()). Confirmed by
  // simulation: calling this outside the window reverts with
  // "ByNdVoter: vote window not open". Gate on both conditions.
  const voteWindowOpen = timeToVoteOpen <= 0;
  const canVote = !epoch.epochVoted && voteWindowOpen;
  // claimBribesBatch() is a MANDATORY step between voting and harvesting: it
  // takes the epoch snapshot and pulls each managed NFT's bribes in. Callable
  // once votes are cast, until the cursor reaches total.
  const bribesClaimed = epoch.claimBribesReady;
  const canClaimBribes = epoch.epochVoted && !epoch.epochHarvested && !bribesClaimed;
  // The cursor/total counter is a paging detail, not a result: the button always
  // sends limit=200 (on-chain MAX_CLAIM_BATCH), so with <=200 managed NFTs it is
  // always one press and the numbers never tell the keeper anything actionable.
  // Only surface them when paging genuinely takes more than one call.
  const needsPaging = epoch.claimBribesTotal > 200;
  // harvestAndDistribute() requires epochSnapshotTaken && cursor >= total on
  // chain — gating on epochVoted alone advertised a call that always reverted
  // with "ByNdVoter: call claimBribesBatch first".
  const canHarvest = epoch.epochVoted && !epoch.epochHarvested && bribesClaimed;

  const steps: KeeperStepDef[] = [
    {
      id: "claimRebases",
      step: "00",
      label: "claimRebases()",
      icon: Droplets,
      can: canClaimRebases,
      done: false,
      isLoading: claimingRebases,
      description:
        "Compounds veMEZO rebase rewards back into all deposited NFTs. Grows locked MEZO balance → grows BynD voting power. No tokens leave the vault.",
      onClick: handleClaimRebases,
      badge: "Ready",
      badgeVariant: "orange",
    },
    {
      id: "extendLocks",
      step: "01",
      label: "extendLocks()",
      icon: Shield,
      can: canExtend,
      done: epoch.epochLocksExtended,
      isLoading: extendingLocks,
      description: epoch.epochLocksExtended
        ? `${EXTEND_BLURB}`
        : extendWindowOpen
          ? `${EXTEND_BLURB} Extend window is open now. Only the first keeper to call it each epoch is credited a keeper slot.`
          : `${EXTEND_BLURB} Only callable in the final window before the epoch boundary. Opens in ${formatTime(epoch.timeUntilExtendWindow)}.`,
      onClick: handleExtendLocks,
      badge: epoch.epochLocksExtended
        ? "Done"
        : canExtend
          ? "Ready"
          : "Waiting",
      badgeVariant: (epoch.epochLocksExtended
        ? "acid"
        : canExtend
          ? "orange"
          : "muted") as BadgeVariant,
    },
    {
      id: "castVotes",
      step: "02",
      // Contract call is optimiseAndVote() as of v2 — label updated to match
      // what actually gets invoked, so this isn't misleading to a keeper
      // reading the docs/source alongside the UI.
      label: "optimiseAndVote()",
      icon: RefreshCw,
      can: canVote,
      done: epoch.epochVoted,
      isLoading: false,
      description: epoch.epochVoted
        ? "Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges (falls back to auto-selecting the best live gauge if none are configured)."
        : voteWindowOpen
          ? "Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges (falls back to auto-selecting the best live gauge if none are configured). Vote window is open now. First keeper to call it each epoch locks in the vote."
          : `Only callable in the final window before Mezo's epoch boundary. Opens in ${formatTime(timeToVoteOpen)}.`,
      onClick: () => setActiveModal("castVotes"),
      badge: epoch.epochVoted ? "Done" : canVote ? "Ready" : "Waiting",
      badgeVariant: (epoch.epochVoted
        ? "acid"
        : canVote
          ? "orange"
          : "muted") as BadgeVariant,
    },
    {
      id: "claimBribes",
      step: "03",
      label: "claimBribesBatch()",
      icon: HandCoins,
      can: canClaimBribes,
      done: bribesClaimed,
      isLoading: claimingBribes,
      description: bribesClaimed
        ? "Bribes pulled in from every gauge's bribe contract. Harvest is unlocked."
        : epoch.epochVoted
          ? `Pulls each managed veMEZO NFT's bribes out of every gauge's bribe contract and into the voter. Required before harvesting.${needsPaging ? ` ${epoch.claimBribesCursor}/${epoch.claimBribesTotal} processed — press again until Done.` : ""}`
          : "Pulls each managed veMEZO NFT's bribes out of every gauge's bribe contract and into the voter. Needs votes cast first.",
      onClick: handleClaimBribes,
      badge: bribesClaimed
        ? "Done"
        : canClaimBribes
          ? "Ready"
          : "Locked",
      badgeVariant: (bribesClaimed
        ? "acid"
        : canClaimBribes
          ? "orange"
          : "muted") as BadgeVariant,
    },
    {
      id: "harvest",
      step: "04",
      label: "harvestAndDistribute()",
      icon: Zap,
      can: canHarvest,
      done: epoch.epochHarvested,
      isLoading: false,
      description: epoch.epochHarvested
        ? "Splits the claimed bribes: protocol fee, keeper bounties, remainder to veBYND stakers."
        : bribesClaimed
          ? "Splits the claimed bribes: protocol fee, keeper bounties, remainder to veBYND stakers."
          : "Splits the claimed bribes across fee, bounties and stakers. Reverts until claimBribesBatch() has finished — run step 03 first.",
      onClick: () => setActiveModal("harvest"),
      badge: epoch.epochHarvested ? "Done" : canHarvest ? "Ready" : "Locked",
      badgeVariant: (epoch.epochHarvested
        ? "acid"
        : canHarvest
          ? "orange"
          : "muted") as BadgeVariant,
    },
  ];

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-[1120px] mx-auto px-5 pt-6">
        <SectionHeader
          label="Keeper"
          title="Keeper dashboard"
          subtitle="Epoch-gated keeper functions. Call in order each epoch. Earn bounties (paid in whatever token was harvested) by triggering harvestAndDistribute."
        />
      </div>

      <div className="max-w-[1120px] mx-auto px-5 py-8 space-y-6">
        <StatusOverview
          mezoEpoch={mezoEpoch}
          liveCountdown={liveCountdown}
          pendingIncentives={stats.pendingIncentives}
          rewardTokenSymbol={stats.rewardTokenSymbol}
        />
        <EpochFlowSteps steps={steps} />
        <KeeperNotes />
      </div>

      <CastVotesModal
        isOpen={activeModal === "castVotes"}
        onClose={() => setActiveModal(null)}
        totalPower={stats.totalVotingPower}
        gauges={gauges}
        epochVoted={epoch.epochVoted}
        timeUntilNextVote={timeToVoteOpen}
        onCastVotes={handleCastVotes}
      />
      <HarvestModal
        isOpen={activeModal === "harvest"}
        onClose={() => setActiveModal(null)}
        pendingIncentives={stats.pendingIncentives}
        bountyBps={stats.bountyBps}
        epochVoted={epoch.epochVoted}
        epochHarvested={epoch.epochHarvested}
        bribesClaimed={bribesClaimed}
        claimCursor={epoch.claimBribesCursor}
        claimTotal={epoch.claimBribesTotal}
        onHarvest={handleHarvest}
      />
    </div>
  );
}

import { useState } from "react";
import { RefreshCw, Zap, Shield, Droplets } from "lucide-react";
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

export default function KeeperPage() {
  const { address, chainId } = useWallet();
  // Pass address+chainId so contractsEnabled fires and all on-chain reads execute
  const { stats, epoch, gauges, refresh } = useProtocol(address, chainId);

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks] = useState(false);
  const [claimingRebases, setClaimingRebases] = useState(false);

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
  const canExtend = !epoch.epochLocksExtended;
  // optimiseAndVote() DOES have a real on-chain time gate — it only opens
  // in the final `voteWindow` seconds before Mezo's real epoch boundary
  // (see ByNdVoter.sol's require on boostVoter.epochNext()). Confirmed by
  // simulation: calling this outside the window reverts with
  // "ByNdVoter: vote window not open". Gate on both conditions.
  const voteWindowOpen = timeToVoteOpen <= 0;
  const canVote = !epoch.epochVoted && voteWindowOpen;
  const canHarvest = epoch.epochVoted && !epoch.epochHarvested;

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
      description:
        "Resets all protocol-held veMEZO to the 4-year maximum, ensuring permanent max governance weight.",
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
      id: "harvest",
      step: "03",
      label: "harvestAndDistribute()",
      icon: Zap,
      can: canHarvest,
      done: epoch.epochHarvested,
      isLoading: false,
      description: "Collects bribes from all gauges, any token.",
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
        onHarvest={handleHarvest}
      />
    </div>
  );
}

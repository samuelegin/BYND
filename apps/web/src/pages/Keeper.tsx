import React, { useState } from "react";
import { RefreshCw, Zap, Shield, Droplets } from "lucide-react";
import { SectionHeader, formatTime } from "@/components/ui";
import { CastVotesModal, HarvestModal } from "@/components/modals";
import {
  BountyHero,
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

  // Matsnet global epoch clock — same math as Terminal
  const EPOCH_WEEK = 7 * 24 * 3600;
  const now = Math.floor(Date.now() / 1000);
  const mezoEpoch = Math.floor(now / EPOCH_WEEK); // e.g. 2942
  const epochEnd = (mezoEpoch + 1) * EPOCH_WEEK; // unix ts when this epoch ends
  const liveCountdown = Math.max(0, epochEnd - now); // seconds until epoch ends
  const voteWindowSec = 4 * 3600; // vote opens 4h before epoch end
  const timeToVoteOpen = Math.max(0, liveCountdown - voteWindowSec); // 0 when window is open

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
      await withTx(() =>
        writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "claimRebases",
          args: [],
        }),
      );
    } finally {
      setClaimingRebases(false);
    }
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    try {
      await withTx(async () => {
        // Step 1: re-lock all NFTs to 4-year max on the Vault
        const extendHash = await writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "extendLocks",
          args: [],
        });
        await publicClient?.waitForTransactionReceipt({ hash: extendHash });

        // Step 2: mark locks extended for this epoch on the Voter so
        // epochLocksExtended flips to true and the button disables.
        return writeContractAsync({
          address: addrs.ByNdVoter,
          abi: VOTER_ABI,
          functionName: "markLocksExtended",
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
        functionName: "castVotes",
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

  const estimatedBounty = (
    (parseFloat(stats.pendingIncentives.replace(/[$,]/g, "")) *
      stats.bountyBps) /
    10000
  ).toFixed(2);

  const canClaimRebases = true;
  const canExtend = !epoch.epochLocksExtended;
  // Vote window opens 4h before Matsnet epoch ends
  const canVote = !epoch.epochVoted && timeToVoteOpen === 0;
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
      label: "castVotes()",
      icon: RefreshCw,
      can: canVote,
      done: epoch.epochVoted,
      isLoading: false,
      description: `Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges. Vote window opens 4h before epoch end${timeToVoteOpen > 0 ? " — opens in " + formatTime(timeToVoteOpen) : " — open now"}.`,
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
      description: `Collects bribes from all gauges — any token. Your ${stats.bountyBps / 100}% bounty: ~$${estimatedBounty} MUSD.`,
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
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <SectionHeader
            label="Keeper"
            title="Keeper Dashboard"
            subtitle="Epoch-gated keeper functions. Call in order each epoch. Earn bounties (paid in whatever token was harvested) by triggering harvestAndDistribute."
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <BountyHero
          estimatedBounty={estimatedBounty}
          rewardTokenSymbol={stats.rewardTokenSymbol}
          bountyBps={stats.bountyBps}
          pendingIncentives={stats.pendingIncentives}
        />
        <StatusOverview
          mezoEpoch={mezoEpoch}
          liveCountdown={liveCountdown}
          pendingIncentives={stats.pendingIncentives}
          rewardTokenSymbol={stats.rewardTokenSymbol}
          bountyBps={stats.bountyBps}
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
        timeUntilNextVote={epoch.timeUntilNextVote}
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

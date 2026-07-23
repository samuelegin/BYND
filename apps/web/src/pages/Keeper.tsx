import { useState, useEffect } from "react";
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

  // Epoch display + vote-window countdown now come from the shared
  // useProtocol hook — same Thursday-based global epoch number and
  // chain-verified timing used on the Terminal page. This used to be a
  // separate local calendar calculation here, which could drift out of
  // sync with the epoch.timeUntilNextVote value the CastVotesModal below
  // actually gates on.
  const mezoEpoch = epoch.displayEpoch;
  const [liveCountdown, setLiveCountdown] = useState<number>(epoch.epochEndsIn);
  useEffect(() => { setLiveCountdown(epoch.epochEndsIn); }, [epoch.epochEndsIn]);
  const [timeToVoteOpen, setTimeToVoteOpen] = useState<number>(epoch.timeUntilNextVote);
  useEffect(() => { setTimeToVoteOpen(epoch.timeUntilNextVote); }, [epoch.timeUntilNextVote]);
  useEffect(() => {
    const id = setInterval(() => {
      setLiveCountdown(prev => Math.max(0, prev - 1));
      setTimeToVoteOpen(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
      // Contract call is optimiseAndVote() as of v2 — label updated to match
      // what actually gets invoked, so this isn't misleading to a keeper
      // reading the docs/source alongside the UI.
      label: "optimiseAndVote()",
      icon: RefreshCw,
      can: canVote,
      done: epoch.epochVoted,
      isLoading: false,
      description: `Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges (falls back to auto-selecting the best live gauge if none are configured). Vote window opens 4h before epoch end${timeToVoteOpen > 0 ? " — opens in " + formatTime(timeToVoteOpen) : " — open now"}.`,
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
      <div className="max-w-[1120px] mx-auto px-5 pt-6">
        <SectionHeader
          label="Keeper"
          title="Keeper dashboard"
          subtitle="Epoch-gated keeper functions. Call in order each epoch. Earn bounties (paid in whatever token was harvested) by triggering harvestAndDistribute."
        />
      </div>

      <div className="max-w-[1120px] mx-auto px-5 py-8 space-y-6">
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

import { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui";
import {
  TerminalHeader,
  StatStrip,
  LiquidLocker,
  StakingTerminal,
  GaugeAllocations,
  YieldTerminal,
  KeeperFunctions,
  EpochStatus,
  TerminalModals,
} from "@/components/terminal";
import { useWallet } from "@/hooks/useWallet";
import { useProtocol } from "@/hooks/useProtocol";
import { useWriteContract, usePublicClient } from "wagmi";
import { parseEther } from "viem";
import {
  getAddresses,
  VAULT_ABI,
  STAKING_ABI,
  VOTER_ABI,
  VEMEZO_ABI,
  ERC20_ABI,
  MATSNET_CHAIN_ID,
} from "@/lib/contracts";

export default function TerminalPage() {
  const { isConnected, address, chainId, connect } = useWallet();

  const {
    stats,
    epoch,
    position,
    gauges,
    isLoading,
    isScanning,
    networkError,
    contractsDeployed,
    refresh,
    recordEpoch,
  } = useProtocol(address, chainId);

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks] = useState(false);

  // Live ticking countdown — Velodrome epoch math
  const EPOCH_WEEK = 7 * 24 * 3600;
  const calcRemaining = () => {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, (Math.floor(now / EPOCH_WEEK) + 1) * EPOCH_WEEK - now);
  };
  const [liveCountdown, setLiveCountdown] = useState<number>(calcRemaining);
  useEffect(() => {
    const id = setInterval(() => setLiveCountdown(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mezoEpoch = Math.floor(Date.now() / 1000 / EPOCH_WEEK);
  // Vote window opens 4h before epoch ends. timeToVoteOpen counts down to that moment.
  // e.g. if epoch ends Wednesday midnight, timeToVoteOpen hits 0 at Wednesday 8pm.
  const VOTE_WINDOW = 4 * 3600; // 4 hours in seconds
  const timeToVoteOpen = Math.max(0, liveCountdown - VOTE_WINDOW);

  const addrs = getAddresses(chainId ?? MATSNET_CHAIN_ID);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const withTx = async (fn: () => Promise<`0x${string}`>) => {
    const hash = await fn();
    await publicClient?.waitForTransactionReceipt({ hash });
    setTimeout(refresh, 1500);
  };

  const handleDeposit = async (tokenId: number) => {
    await withTx(async () => {
      // Pre-flight: check for permanent lock — vault requires lock.end > 0.
      // Permanently locked veMEZO has end=0 and will always revert with
      // "ByNdVault: lock expired". Surface a clear error before wasting gas.
      const lockData = (await publicClient?.readContract({
        address: addrs.VeMEZO as `0x${string}`,
        abi: VEMEZO_ABI,
        functionName: "locked",
        args: [BigInt(tokenId)],
      })) as { amount: bigint; end: bigint; isPermanent: boolean } | undefined;

      if (lockData?.isPermanent) {
        throw new Error(
          "veMEZO #" +
            tokenId +
            " is permanently locked. " +
            "Call unlock_permanent(" +
            tokenId +
            ") on the veMEZO contract first, then deposit.",
        );
      }

      // Step 1: approve vault to transfer the NFT, then wait for the tx to be mined.
      // On Matsnet block times are slow — calling deposit() before the approval lands
      // causes the vault's safeTransferFrom to revert with "not approved".
      const approveHash = await writeContractAsync({
        address: addrs.VeMEZO,
        abi: VEMEZO_ABI,
        functionName: "approve",
        args: [addrs.ByNdVault, BigInt(tokenId)],
      });
      await publicClient?.waitForTransactionReceipt({ hash: approveHash });

      // Step 2: deposit — approval is now confirmed on-chain.
      return writeContractAsync({
        address: addrs.ByNdVault,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [BigInt(tokenId)],
      });
    });
  };

  const handleWithdraw = async (_tokenId: number) => {
    alert("Permanent lock — exit via veBYND/MEZO pool on Mezo Swap.");
  };

  const handleStake = async (amount: string) => {
    await withTx(async () => {
      await writeContractAsync({
        address: addrs.VeBYND,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [addrs.ByNdStaking, parseEther(amount)],
      });
      return writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: "stake",
        args: [parseEther(amount)],
      });
    });
  };

  const handleUnstake = async (amount: string) => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: "unstake",
        args: [parseEther(amount)],
      }),
    );
  };

  const handleClaim = async () => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: "claimAll",
        args: [],
      }),
    );
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
    recordEpoch(
      epoch.currentEpoch,
      stats.totalVotingPower,
      stats.pendingIncentives,
      stats.bountyBps,
    );
  };

  const handleUnlockPermanent = async (tokenId: number) => {
    // withTx expects a fn that returns a hash — return it directly and
    // wait for receipt inside withTx's own flow.
    await withTx(() =>
      writeContractAsync({
        address: addrs.VeMEZO,
        abi: VEMEZO_ABI,
        functionName: "unlockPermanent",
        args: [BigInt(tokenId)],
      }),
    );
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

  const checkAllowance = async (_amount: string) => true;
  const approveToken = async (_amount: string) => {};

  const hasRewards =
    parseFloat(position.claimableMUSD) > 0 ||
    parseFloat(position.claimableMEZO) > 0;
  const canExtend = !epoch.epochLocksExtended;

  return (
    <div className="min-h-screen bg-void">
      <TerminalHeader
        isLoading={isLoading}
        isScanning={isScanning}
        networkError={networkError}
        contractsDeployed={contractsDeployed}
        refresh={refresh}
      />

      <StatStrip
        stats={stats}
        position={position}
        mezoEpoch={mezoEpoch}
        liveCountdown={liveCountdown}
      />

      <div className="max-w-[1120px] mx-auto px-5 py-8">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-14 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full border border-void-border flex items-center justify-center">
              <Lock size={24} className="text-white/60" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-2">
                Access required
              </p>
              <p className="text-white/60 text-sm max-w-sm">
                Connect your wallet or Mezo Passport to access the terminal.
              </p>
            </div>
            <Button variant="primary" onClick={connect}>
              Connect wallet
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <LiquidLocker
                position={position}
                stats={stats}
                isScanning={isScanning}
                isLoading={isLoading}
                onDeposit={() => setActiveModal("deposit")}
                onWithdraw={() => setActiveModal("withdraw")}
              />
              <StakingTerminal
                position={position}
                stats={stats}
                onStake={() => setActiveModal("stake")}
                onUnstake={() => setActiveModal("unstake")}
              />
              <GaugeAllocations gauges={gauges} />
            </div>

            <div className="lg:col-span-4 space-y-6">
              <YieldTerminal
                position={position}
                stats={stats}
                hasRewards={hasRewards}
                onClaim={() => setActiveModal("claim")}
              />
              <KeeperFunctions
                epoch={epoch}
                stats={stats}
                canExtend={canExtend}
                extendingLocks={extendingLocks}
                timeToVoteOpen={timeToVoteOpen}
                onExtendLocks={handleExtendLocks}
                onCastVotes={() => setActiveModal("castVotes")}
                onHarvest={() => setActiveModal("harvest")}
              />
              <EpochStatus
                epoch={epoch}
                stats={stats}
                mezoEpoch={mezoEpoch}
                liveCountdown={liveCountdown}
              />
            </div>
          </div>
        )}
      </div>

      <TerminalModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        position={position}
        stats={stats}
        epoch={epoch}
        gauges={gauges}
        liveCountdown={liveCountdown}
        onUnlockPermanent={handleUnlockPermanent}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
        onStake={handleStake}
        onCheckAllowance={checkAllowance}
        onApprove={approveToken}
        onUnstake={handleUnstake}
        onClaim={handleClaim}
        onCastVotes={handleCastVotes}
        onHarvest={handleHarvest}
      />
    </div>
  );
}

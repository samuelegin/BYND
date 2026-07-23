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

  // NOTE: optimiseAndVote() has no on-chain time window (see ByNdVoter.sol's
  // own doc comment: "Callable anytime — no time window"). ByNdVoter also has
  // no timeUntilNextVote() function, so this countdown is a purely
  // client-side/cosmetic display and no longer gates the "Cast system votes"
  // button — that's gated solely on epoch.epochVoted now.
  const [liveCountdown, setLiveCountdown] = useState<number>(epoch.timeUntilNextVote);
  useEffect(() => {
    setLiveCountdown(epoch.timeUntilNextVote);
  }, [epoch.timeUntilNextVote]);

  // Ticking countdown for the full epoch, used for the "Time remaining" /
  // epoch-card display.
  const [epochCountdown, setEpochCountdown] = useState<number>(epoch.epochEndsIn);
  useEffect(() => {
    setEpochCountdown(epoch.epochEndsIn);
  }, [epoch.epochEndsIn]);

  useEffect(() => {
    const id = setInterval(() => {
      setLiveCountdown(prev => Math.max(0, prev - 1));
      setEpochCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Real global Mezo epoch number (new epoch every Thursday 00:00 UTC) —
  // was previously our contract's internal counter, which only increments
  // once per harvest cycle and showed a misleading "#1".
  const mezoEpoch = epoch.displayEpoch;
  // Cosmetic countdown only — does not gate optimiseAndVote() (see NOTE above).
  const timeToVoteOpen = liveCountdown;

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
      // Wait for the approval to be mined before staking — on Matsnet block
      // times are slow, so calling stake() before the approval lands causes
      // ByNdStaking's transferFrom to revert (allowance still 0 on-chain).
      // Same pattern as handleDeposit's approve/deposit sequencing above.
      const approveHash = await writeContractAsync({
        address: addrs.VeBYND,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [addrs.ByNdStaking, parseEther(amount)],
      });
      await publicClient?.waitForTransactionReceipt({ hash: approveHash });

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
        // extendLocks() takes a batch of tokenIds (max 200/call) — use the
        // contract's own paging helper to fetch exactly the ones that still
        // need extending. See VAULT_ABI comment in lib/contracts.ts.
        const result = (await publicClient?.readContract({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "tokensNeedingExtend",
          args: [0n, 200n],
        })) as readonly [readonly bigint[], bigint] | undefined;

        const tokenIds = result?.[0];
        if (!tokenIds || tokenIds.length === 0) {
          throw new Error("No locks currently need extending.");
        }

        // ByNdVault.extendLocks() already calls voter.markLocksExtended()
        // internally as msg.sender == vault — a separate frontend call to
        // markLocksExtended() would always revert, since ByNdVoter requires
        // msg.sender == vault and a user's wallet is never that address.
        return writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "extendLocks",
          args: [tokenIds as bigint[]],
        });
      });
    } finally {
      setExtendingLocks(false);
    }
  };

  const checkAllowance = async (_amount: string) => true;
  const approveToken = async (_amount: string) => {};

  const hasRewards = position.claimableRewards.some(r => parseFloat(r.amount || '0') > 0);
  const canExtend = epoch.canExtendLocks;

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
        liveCountdown={epochCountdown}
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
                liveCountdown={epochCountdown}
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
        timeToVoteOpen={timeToVoteOpen}
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

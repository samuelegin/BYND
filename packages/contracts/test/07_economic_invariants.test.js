const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

// Rewards stream over this window rather than landing in a single block (BYND-03).
const REWARDS_DURATION = 7 * 24 * 60 * 60;

describe("Economic invariants & tokenomics stress tests", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function fastForwardToVoteWindow() {
    await jumpInsideVoteWindow(ctx.voter);
  }

  describe("ByNdVoter._distribute() repeated-harvest allowance bug", () => {
    it("does NOT permanently brick harvestAndDistribute after an epoch harvests a token while totalStaked == 0", async () => {
      const { voter, boostVoter, rewardTokenA, deployer, alice } = ctx;

      // Epoch 0: a gauge harvest happens, but nobody has staked veBYND yet
      // (totally realistic at launch — bribes can arrive before the first staker).
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await rewardTokenA.mint(deployer.address, ethers.parseEther("1000"));
      await rewardTokenA.connect(deployer).approve(await boostVoter.getAddress(), ethers.parseEther("1000"));
      await boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("1000"));

      await voter.connect(deployer).setManagedTokenId(1);
      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);
      // totalStaked is 0 right now — staking.notifyRewardAmount() will no-op
      // internally, but ByNdVoter still calls safeApprove(staking, stakerAmount)
      // beforehand, leaving that allowance stuck at a non-zero value.
      await voter.harvestAndDistribute();

      // Epoch 1: now someone stakes, and a second harvest tries to approve the
      // staking contract again for the *same* reward token. If ByNdVoter uses
      // safeApprove() (not forceApprove()), OpenZeppelin's SafeERC20 reverts
      // on a non-zero -> non-zero allowance change, permanently bricking this
      // reward token's harvest path until someone manually zeroes the
      // allowance from outside the contract (which nothing here allows).
      await ctx.veBYND.grantRole(await ctx.veBYND.MINTER_ROLE(), deployer.address);
      await ctx.veBYND.mint(alice.address, ethers.parseEther("10"));
      await ctx.veBYND.connect(alice).approve(await ctx.staking.getAddress(), ethers.parseEther("10"));
      await ctx.staking.connect(alice).stake(ethers.parseEther("10"));

      await rewardTokenA.mint(deployer.address, ethers.parseEther("1000"));
      await rewardTokenA.connect(deployer).approve(await boostVoter.getAddress(), ethers.parseEther("1000"));
      await boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("1000"));

      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);
      await expect(voter.harvestAndDistribute()).to.not.be.reverted;
    });
  });

  describe("ByNdStaking reward accounting conservation", () => {
    it("never lets total claimable across all stakers exceed the amount actually notified", async () => {
      const { staking, veBYND, deployer, alice, bob, carol, musd } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);

      // Deliberately awkward, non-round amounts to stress integer division.
      await veBYND.mint(alice.address, 777);
      await veBYND.mint(bob.address, 333);
      await veBYND.mint(carol.address, 1);
      for (const u of [alice, bob, carol]) {
        await veBYND.connect(u).approve(await staking.getAddress(), ethers.MaxUint256);
      }
      await staking.connect(alice).stake(777);
      await staking.connect(bob).stake(333);
      await staking.connect(carol).stake(1);

      await staking.setDistributor(deployer.address);
      const notifyAmount = 999999n; // not evenly divisible by totalStaked (1111)
      await musd.mint(deployer.address, notifyAmount);
      await musd.connect(deployer).approve(await staking.getAddress(), notifyAmount);
      await staking.notifyRewardAmount(await musd.getAddress(), notifyAmount);

      // Let the whole window stream so the conservation check covers the full
      // notified amount, not a partial slice of it.
      await time.increase(REWARDS_DURATION);

      const claimA = await staking.claimable(await musd.getAddress(), alice.address);
      const claimB = await staking.claimable(await musd.getAddress(), bob.address);
      const claimC = await staking.claimable(await musd.getAddress(), carol.address);
      const totalClaimable = claimA + claimB + claimC;

      expect(totalClaimable).to.be.lte(notifyAmount);
      // Dust left behind by integer division should be small — roughly 1 wei of
      // rounding loss per staker, plus a sub-wei residue from truncating
      // rewardRate. Never a meaningful amount.
      expect(notifyAmount - totalClaimable).to.be.lte(4n);

      // and claiming for real must actually succeed for exactly these amounts
      await staking.connect(alice).claimAll();
      await staking.connect(bob).claimAll();
      await staking.connect(carol).claimAll();
      expect(await musd.balanceOf(alice.address)).to.equal(claimA);
      expect(await musd.balanceOf(bob.address)).to.equal(claimB);
      expect(await musd.balanceOf(carol.address)).to.equal(claimC);
    });

    it("accumulates correctly across many small sequential notifies without runaway precision drift", async () => {
      const { staking, veBYND, deployer, alice, musd } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
      await veBYND.mint(alice.address, ethers.parseEther("1"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
      await staking.connect(alice).stake(ethers.parseEther("1"));
      await staking.setDistributor(deployer.address);

      const perNotify = 12345n; // small, awkward amount
      const rounds = 50;
      await musd.mint(deployer.address, perNotify * BigInt(rounds));
      await musd.connect(deployer).approve(await staking.getAddress(), perNotify * BigInt(rounds));

      for (let i = 0; i < rounds; i++) {
        await staking.notifyRewardAmount(await musd.getAddress(), perNotify);
      }

      // Each notify folds the unstreamed leftover into a fresh window, so the
      // last one has to run out before everything notified is claimable.
      await time.increase(REWARDS_DURATION);

      const claimable = await staking.claimable(await musd.getAddress(), alice.address);
      const totalNotified = perNotify * BigInt(rounds);
      expect(claimable).to.be.lte(totalNotified);
      // sole staker owns the whole pool, so drift should be negligible (<= rounds,
      // i.e. at most ~1 wei lost per notify call to integer division)
      expect(totalNotified - claimable).to.be.lte(BigInt(rounds));
    });

    it("cannot be sniped: staking immediately before a notify and exiting immediately after captures ~nothing", async () => {
      const { staking, veBYND, deployer, alice, bob, musd } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
      await veBYND.mint(alice.address, ethers.parseEther("100"));
      await veBYND.mint(bob.address, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
      await veBYND.connect(bob).approve(await staking.getAddress(), ethers.MaxUint256);

      // alice has been staked "forever"; bob stakes in the same block as the
      // notify and unstakes right after claiming.
      await staking.connect(alice).stake(ethers.parseEther("100"));
      await staking.setDistributor(deployer.address);

      await staking.connect(bob).stake(ethers.parseEther("100"));
      const notifyAmount = ethers.parseEther("10");
      await musd.mint(deployer.address, notifyAmount);
      await musd.connect(deployer).approve(await staking.getAddress(), notifyAmount);
      await staking.notifyRewardAmount(await musd.getAddress(), notifyAmount);

      // bob claims and fully exits in the very next actions
      await staking.connect(bob).claimAll();
      await staking.connect(bob).unstake(ethers.parseEther("100"));

      // Rewards accrue per second over rewardsDuration rather than landing in the
      // notify block, so bob's zero-risk window earns him a few seconds of
      // half-pool accrual out of a 7-day stream: dust, not 50% of the harvest.
      // This is BYND-03; before the fix bob took exactly notifyAmount / 2.
      const bobTook = await musd.balanceOf(bob.address);
      expect(bobTook).to.be.lt(notifyAmount / 1000n);

      // The value bob did not take is not stranded — it keeps streaming to alice,
      // who is now the only staker. Bob's own residual counts too: he accrued for
      // one more block between claiming and unstaking, which stays credited to
      // him rather than being lost.
      await time.increase(REWARDS_DURATION);
      const aliceClaimable = await staking.claimable(await musd.getAddress(), alice.address);
      const bobResidual = await staking.claimable(await musd.getAddress(), bob.address);
      expect(aliceClaimable + bobTook + bobResidual).to.be.closeTo(notifyAmount, 1_000_000n);
    });
  });

  describe("ByNdVoter bounty rounding", () => {
    it("routes the entire harvested amount to stakers (none lost) when the harvest is too small for any keeper to get a non-zero bounty share", async () => {
      const { voter, boostVoter, staking, veBYND, deployer, alice, rewardTokenA } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
      await veBYND.mint(alice.address, ethers.parseEther("10"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
      await staking.connect(alice).stake(ethers.parseEther("10"));

      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      // bountyBps = 100 (1%) by default, split 5 ways -> each keeper needs
      // harvested >= 500 wei to get a non-zero share (100/10000/5 = 1/500).
      // Seed something below that floor.
      const tinyHarvest = 100n;
      await rewardTokenA.mint(deployer.address, tinyHarvest);
      await rewardTokenA.connect(deployer).approve(await boostVoter.getAddress(), tinyHarvest);
      await boostVoter.connect(deployer).seedBribe(bribe, tinyHarvest);

      await voter.connect(deployer).setManagedTokenId(1);
      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);
      const treasuryBalBefore = await rewardTokenA.balanceOf(ctx.treasury.address);
      await voter.harvestAndDistribute();
      const treasuryBalAfter = await rewardTokenA.balanceOf(ctx.treasury.address);

      // no keeper bounty was paid out...
      expect(treasuryBalAfter).to.equal(treasuryBalBefore);
      // ...and the full tiny amount instead reached the staking contract as
      // staker rewards rather than being silently stuck/lost in the voter.
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(tinyHarvest);

      // The staking contract streams over rewardsDuration, so the whole window
      // has to elapse before all 100 wei is claimable. A 100-wei reward split
      // across 604800 seconds is the worst case for rate truncation; the 1e36
      // rate scaling is what keeps it from rounding to nothing, but a handful
      // of wei can still be lost to the floor() in rewardRate and rewardPerToken.
      await time.increase(REWARDS_DURATION);
      const claimable = await staking.claimable(await rewardTokenA.getAddress(), alice.address);
      expect(claimable).to.be.closeTo(tinyHarvest, 15n);
    });
  });

  describe("Large-value sanity (no overflow / no silent truncation at realistic scale)", () => {
    it("handles a very large single staker and a large notify amount without reverting or losing precision beyond normal dust", async () => {
      const { staking, veBYND, deployer, alice, musd } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);

      const hugeStake = ethers.parseEther("1000000000"); // 1B veBYND, 18 decimals
      await veBYND.mint(alice.address, hugeStake);
      await veBYND.connect(alice).approve(await staking.getAddress(), hugeStake);
      await staking.connect(alice).stake(hugeStake);
      await staking.setDistributor(deployer.address);

      const hugeNotify = ethers.parseEther("50000000"); // 50M reward tokens in one shot
      await musd.mint(deployer.address, hugeNotify);
      await musd.connect(deployer).approve(await staking.getAddress(), hugeNotify);
      await expect(staking.notifyRewardAmount(await musd.getAddress(), hugeNotify)).to.not.be.reverted;

      // Sole staker, so after the full window they own essentially all of it.
      // rewardPerToken is quantised to 1e18, so the largest amount that can be
      // lost to truncation is one quantum spread over the pool — totalStaked/1e18,
      // here 1e9 wei against a 5e25 reward, a relative loss of ~2e-17.
      await time.increase(REWARDS_DURATION);
      const claimable = await staking.claimable(await musd.getAddress(), alice.address);
      const quantum = hugeStake / ethers.parseEther("1");
      expect(claimable).to.be.closeTo(hugeNotify, quantum);
      expect(claimable).to.be.lte(hugeNotify);
    });
  });
});

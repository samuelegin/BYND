const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

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

      const claimA = await staking.claimable(await musd.getAddress(), alice.address);
      const claimB = await staking.claimable(await musd.getAddress(), bob.address);
      const claimC = await staking.claimable(await musd.getAddress(), carol.address);
      const totalClaimable = claimA + claimB + claimC;

      expect(totalClaimable).to.be.lte(notifyAmount);
      // dust left behind by integer division should be small — bounded by
      // roughly 1 wei of rounding loss per staker, never a meaningful amount
      expect(notifyAmount - totalClaimable).to.be.lte(3n);

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

      const claimable = await staking.claimable(await musd.getAddress(), alice.address);
      const totalNotified = perNotify * BigInt(rounds);
      expect(claimable).to.be.lte(totalNotified);
      // sole staker owns the whole pool, so drift should be negligible (<= rounds,
      // i.e. at most ~1 wei lost per notify call to integer division)
      expect(totalNotified - claimable).to.be.lte(BigInt(rounds));
    });

    it("a staker who joins immediately before notify and exits immediately after still captures a full pro-rata share (documents reward-sniping exposure — no time-weighting/vesting exists)", async () => {
      const { staking, veBYND, deployer, alice, bob, musd } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
      await veBYND.mint(alice.address, ethers.parseEther("100"));
      await veBYND.mint(bob.address, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
      await veBYND.connect(bob).approve(await staking.getAddress(), ethers.MaxUint256);

      // alice has been staked "forever"; bob stakes in the same block as the
      // notify and could in principle unstake right after claiming.
      await staking.connect(alice).stake(ethers.parseEther("100"));
      await staking.setDistributor(deployer.address);

      await staking.connect(bob).stake(ethers.parseEther("100"));
      const notifyAmount = ethers.parseEther("10");
      await musd.mint(deployer.address, notifyAmount);
      await musd.connect(deployer).approve(await staking.getAddress(), notifyAmount);
      await staking.notifyRewardAmount(await musd.getAddress(), notifyAmount);

      // bob claims and fully exits in the very next actions
      const bobClaimable = await staking.claimable(await musd.getAddress(), bob.address);
      await staking.connect(bob).claimAll();
      await staking.connect(bob).unstake(ethers.parseEther("100"));

      // bob (0 blocks of "at risk" time) got an equal 50/50 split with alice,
      // purely because stake sizes were equal at the moment of notify.
      const aliceClaimable = await staking.claimable(await musd.getAddress(), alice.address);
      expect(bobClaimable).to.equal(aliceClaimable);
      expect(bobClaimable).to.equal(notifyAmount / 2n);
      // NOTE: this is expected behavior for the current Synthetix-style
      // rewardPerToken design, not a bug — flagging it because there is no
      // minimum-staking-duration or linear-vesting mechanism, so a keeper bot
      // could in principle front-run every harvestAndDistribute() call,
      // capture a share, and exit same-block. Worth a deliberate go/no-go
      // decision before mainnet, not something a test can "pass/fail" on.
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
      const treasuryBalBefore = await rewardTokenA.balanceOf(ctx.treasury.address);
      await voter.harvestAndDistribute();
      const treasuryBalAfter = await rewardTokenA.balanceOf(ctx.treasury.address);

      // no keeper bounty was paid out...
      expect(treasuryBalAfter).to.equal(treasuryBalBefore);
      // ...and the full tiny amount instead reached the staking contract as
      // staker rewards rather than being silently stuck/lost in the voter.
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(tinyHarvest);
      const claimable = await staking.claimable(await rewardTokenA.getAddress(), alice.address);
      expect(claimable).to.equal(tinyHarvest);
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

      const claimable = await staking.claimable(await musd.getAddress(), alice.address);
      expect(claimable).to.equal(hugeNotify); // sole staker, so it should be exact
    });
  });
});

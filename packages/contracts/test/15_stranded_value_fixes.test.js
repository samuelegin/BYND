const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

// Staker rewards stream over this window rather than landing in one block (BYND-03).
const REWARDS_DURATION = 7 * 24 * 60 * 60;
// Truncation dust from the per-second reward rate.
const DUST = 1_000_000n;

/**
 * Regression tests for the value-stranding / liveness bugs.
 *
 * Each test here FAILS against the pre-fix contracts and passes after. They are
 * deliberately written against observable balances rather than internal state,
 * so they stay honest if the implementation changes again.
 */
describe("ByNdVoter — stranded value & liveness fixes", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function fastForwardToVoteWindow() {
    await jumpInsideVoteWindow(ctx.voter);
  }

  async function stake(user, amount) {
    const { staking, veBYND, deployer } = ctx;
    const role = await veBYND.MINTER_ROLE();
    if (!(await veBYND.hasRole(role, deployer.address))) {
      await veBYND.grantRole(role, deployer.address);
    }
    await veBYND.mint(user.address, amount);
    await veBYND.connect(user).approve(await staking.getAddress(), amount);
    await staking.connect(user).stake(amount);
  }

  /** Seeds `amount` of rewardTokenA into a gauge's bribe pot. */
  async function seedBribe(bribe, amount) {
    const { boostVoter, rewardTokenA, deployer } = ctx;
    await rewardTokenA.mint(deployer.address, amount);
    await rewardTokenA
      .connect(deployer)
      .approve(await boostVoter.getAddress(), amount);
    await boostVoter.connect(deployer).seedBribe(bribe, amount);
  }

  async function runEpoch() {
    const { voter } = ctx;
    await fastForwardToVoteWindow();
    await voter.optimiseAndVote();
    await voter.claimBribesBatch(200);
    await voter.harvestAndDistribute();
  }

  describe("staker share deferred when nobody is staked", () => {
    it("hands a later epoch's stakers the share that was harvested while totalStaked == 0, instead of stranding it forever", async () => {
      const { voter, staking, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);

      // --- Epoch 0: bribes arrive before anyone has staked. ---
      await seedBribe(bribe, ethers.parseEther("1000"));
      await runEpoch();

      // The 99% staker share could not be pushed (notifyRewardAmount no-ops at
      // zero stake), so it stays in the voter and is recorded as carried over.
      // It banks into carriedOverNet: the fee and bounty were already paid out
      // of this epoch's harvest, so the next clearing must pass it through
      // untaxed (BYND-04).
      const carried = await voter.carriedOverNet(await rewardTokenA.getAddress());
      expect(carried).to.equal(ethers.parseEther("990"));
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
      expect(await staking.rewardTokenCount()).to.equal(0);

      // --- Epoch 1: a real staker shows up, fresh bribes arrive. ---
      await stake(alice, ethers.parseEther("10"));
      await seedBribe(bribe, ethers.parseEther("1000"));
      await runEpoch();

      // Pre-fix, epoch 0's 990 was absorbed into epoch 1's balanceBefore
      // snapshot and silently never distributed. Post-fix it is combined with
      // epoch 1's harvest and pushed to the staking contract.
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
      expect(await voter.carriedOverNet(await rewardTokenA.getAddress())).to.equal(0);

      const staked = await rewardTokenA.balanceOf(await staking.getAddress());
      // Epoch 1's available = 1000 new (untaxed) + 990 deferred (already taxed
      // in epoch 0). Only the new 1000 pays the 1% bounty, leaving 990; the
      // deferred 990 passes straight through. 990 + 990 = 1980.
      //
      // This assertion previously read 1970.1, which encoded the BYND-04
      // double-tax: the deferred share was banked into `carriedOver` and taxed
      // a second time on this clearing, burning a further 9.9 to keepers who
      // had already been paid for that value. The deferred path now banks into
      // `carriedOverNet`, which bypasses fee and bounty. The test was asserting
      // the bug, so the number moves up — this is not a weakened assertion.
      expect(staked).to.equal(ethers.parseEther("1980"));
      expect(staked).to.be.gt(ethers.parseEther("990"));

      // And it is genuinely claimable by the staker, not just parked — once the
      // streaming window has elapsed. The transfer into the pool is immediate;
      // only the claim matures over rewardsDuration (BYND-03).
      await time.increase(REWARDS_DURATION);
      expect(
        await staking.claimable(await rewardTokenA.getAddress(), alice.address)
      ).to.be.closeTo(staked, DUST);
    });

    it("does not leave a dangling allowance to the staking contract when the share is deferred", async () => {
      const { voter, staking, rewardTokenA, deployer } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await seedBribe(bribe, ethers.parseEther("1000"));
      await runEpoch();

      expect(
        await rewardTokenA.allowance(
          await voter.getAddress(),
          await staking.getAddress()
        )
      ).to.equal(0);
    });
  });

  describe("below-threshold dust accumulates instead of vanishing", () => {
    it("carries sub-threshold harvests across epochs until they clear the threshold, then pays them out", async () => {
      const { voter, staking, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await stake(alice, ethers.parseEther("10"));

      // Threshold sits above a single epoch's harvest, so epoch 0 alone
      // can never clear it.
      await voter
        .connect(deployer)
        .setTokenMinHarvestThreshold(
          await rewardTokenA.getAddress(),
          ethers.parseEther("150")
        );

      await seedBribe(bribe, ethers.parseEther("100"));
      await runEpoch();

      // Held back, but explicitly on the books — not lost to the next snapshot.
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(
        ethers.parseEther("100")
      );
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(0);

      // Epoch 1: another 100 arrives; 200 total now clears the 150 threshold.
      await seedBribe(bribe, ethers.parseEther("100"));
      await runEpoch();

      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
      // 200 available at 1% bounty -> 2 to keepers, 198 to stakers.
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(
        ethers.parseEther("198")
      );
    });

    it("a below-threshold epoch still closes (advances currentEpoch) rather than reverting the harvest", async () => {
      const { voter, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await stake(alice, ethers.parseEther("10"));
      await voter
        .connect(deployer)
        .setTokenMinHarvestThreshold(
          await rewardTokenA.getAddress(),
          ethers.parseEther("150")
        );

      await seedBribe(bribe, ethers.parseEther("100"));
      const before = await voter.currentEpoch();
      await runEpoch();

      // Pre-fix this reverted on `require(anyDistributed)`, which also rolled
      // back the carry bookkeeping and wedged the epoch.
      expect(await voter.currentEpoch()).to.equal(before + 1n);
    });

    it("still reverts a genuinely empty harvest", async () => {
      const { voter, rewardTokenA, deployer } = ctx;
      await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);

      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);
      await expect(voter.harvestAndDistribute()).to.be.revertedWith(
        "ByNdVoter: nothing harvested this epoch"
      );
    });
  });

  describe("setManagedTokenId stale index", () => {
    it("lets a previously-managed tokenId be re-added after being replaced", async () => {
      const { voter, deployer } = ctx;

      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setManagedTokenId(2);

      // Pre-fix, tokenIdIndex[1] was left dangling at 1, so addManagedTokenId
      // treated tokenId 1 as "already managed" and silently skipped it —
      // permanently excluding it from voting (the vault swallows the failure).
      await voter.connect(deployer).addManagedTokenId(1);

      const managed = await voter.getManagedTokenIds();
      expect(managed.map((n) => Number(n))).to.have.members([2, 1]);
      expect(await voter.getManagedTokenCount()).to.equal(2);
    });

    it("keeps removeManagedTokenId working on a tokenId re-added after a reset", async () => {
      const { voter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setManagedTokenId(2);
      await voter.connect(deployer).addManagedTokenId(1);

      await voter.connect(deployer).removeManagedTokenId(1);
      const managed = await voter.getManagedTokenIds();
      expect(managed.map((n) => Number(n))).to.deep.equal([2]);
    });
  });

  describe("epoch snapshot buffer", () => {
    it("handles a gauge carrying more than 8 reward tokens without an out-of-bounds panic", async () => {
      const { voter, boostVoter, deployer, alice } = ctx;
      await stake(alice, ethers.parseEther("10"));

      // 12 distinct reward tokens on a single gauge — pre-fix the scratch
      // buffer was sized gauges.length * 8 and this reverted the whole
      // harvest path.
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const tokens = [];
      for (let i = 0; i < 12; i++) {
        const t = await MockERC20.deploy(`Tok${i}`, `T${i}`, 18);
        tokens.push(await t.getAddress());
      }

      const MockReward = await ethers.getContractFactory("MockReward");
      const bribeContract = await MockReward.deploy();
      const bribe = await bribeContract.getAddress();
      const gauge = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, bribe);
      await voter
        .connect(deployer)
        .setGauges([gauge], [bribe], ["Wide"], [10000], [tokens]);
      await voter.connect(deployer).setManagedTokenId(1);

      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await expect(voter.claimBribesBatch(200)).to.not.be.reverted;
    });
  });

  describe("forceCloseEpoch reachability", () => {
    it("can unwedge an epoch that voted via auto-select while gauges were never configured", async () => {
      const { voter, boostVoter, deployer } = ctx;

      // Auto-select path: a live gauge exists on the boost voter, but
      // governance never called setGauges.
      const MockReward = await ethers.getContractFactory("MockReward");
      const bribeContract = await MockReward.deploy();
      await boostVoter.addGauge(
        ethers.Wallet.createRandom().address,
        await bribeContract.getAddress()
      );
      await voter.connect(deployer).setManagedTokenId(1);

      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      expect(await voter.epochVoted(0)).to.equal(true);

      // Both harvest paths are gated on gauges.length > 0, so the epoch can
      // never be closed normally — and pre-fix forceCloseEpoch additionally
      // required a snapshot that claimBribesBatch could never take.
      await expect(voter.claimBribesBatch(200)).to.be.reverted;
      await expect(voter.harvestAndDistribute()).to.be.reverted;

      await voter.connect(deployer).forceCloseEpoch();
      expect(await voter.currentEpoch()).to.equal(1);

      // Voting works again in the new epoch.
      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote()).to.not.be.reverted;
    });

    // This test used to be "is still governance-only", asserting that a
    // non-governance caller got "ByNdVoter: not governance". That assertion
    // encoded the BYND-06 freeze: every state needing this hatch — voted with no
    // gauges configured, or nothing harvested — is a permanent freeze if the
    // governance key is lost, because no other path advances the epoch. The
    // restriction is now a delay rather than a permanent bar. Governance keeps
    // the immediate path; see test/19_liveness.test.js for the full gating.
    it("is gated for non-governance callers, but no longer barred outright", async () => {
      const { voter, alice } = ctx;

      // Epoch 0 was never voted here, so there is nothing stranded to rescue —
      // this is the guard that also stops the permissionless path being looped.
      await expect(
        voter.connect(alice).forceCloseEpoch()
      ).to.be.revertedWith("ByNdVoter: votes not cast");
    });

    it("banks already-claimed value into carriedOver instead of stranding it", async () => {
      const { voter, rewardTokenA, deployer } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await seedBribe(bribe, ethers.parseEther("500"));

      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200); // pulls the 500 in, snapshot taken

      await voter.connect(deployer).forceCloseEpoch();

      // Closed without distributing, but the value is on the books for the
      // next epoch rather than swallowed by its balanceBefore snapshot.
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(
        ethers.parseEther("500")
      );
    });
  });
});
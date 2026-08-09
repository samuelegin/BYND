const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployAll, mintAndDeposit } = require("./fixtures");

// Rewards stream over a fixed window rather than landing in one block (BYND-03),
// so a notified amount is only fully claimable after this much time has passed.
const REWARDS_DURATION = 7 * 24 * 60 * 60;

// rewardRate is a truncating integer division, so a fully-streamed period can
// come up a few wei short of the notified amount. That dust is by design.
const DUST = 1_000_000n;

async function asVoter(ctx, fn) {
  const voterAddr = await ctx.voter.getAddress();
  await ethers.provider.send("hardhat_impersonateAccount", [voterAddr]);
  await ethers.provider.send("hardhat_setBalance", [
    voterAddr,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  const voterSigner = await ethers.getSigner(voterAddr);
  const result = await fn(voterSigner);
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [voterAddr]);
  return result;
}

describe("ByNdStaking", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function giveVeBYND(user, amount) {
    const { veBYND, deployer } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(user.address, amount);
  }

  describe("stake / unstake", () => {
    it("moves veBYND into the staking contract and updates balances", async () => {
      const { staking, veBYND, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await expect(staking.connect(alice).stake(ethers.parseEther("100")))
        .to.emit(staking, "Staked")
        .withArgs(alice.address, ethers.parseEther("100"));

      expect(await staking.stakedBalance(alice.address)).to.equal(
        ethers.parseEther("100")
      );
      expect(await staking.totalStaked()).to.equal(ethers.parseEther("100"));
    });

    it("reverts staking/unstaking zero amount", async () => {
      const { staking, alice } = ctx;
      await expect(staking.connect(alice).stake(0)).to.be.revertedWith(
        "ByNdStaking: amount = 0"
      );
      await expect(staking.connect(alice).unstake(0)).to.be.revertedWith(
        "ByNdStaking: amount = 0"
      );
    });

    it("reverts unstaking more than staked", async () => {
      const { staking, veBYND, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("10"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
      await staking.connect(alice).stake(ethers.parseEther("10"));
      await expect(
        staking.connect(alice).unstake(ethers.parseEther("11"))
      ).to.be.revertedWith("ByNdStaking: insufficient balance");
    });

    it("has no unbonding period — unstake returns tokens immediately", async () => {
      const { staking, veBYND, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("10"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
      await staking.connect(alice).stake(ethers.parseEther("10"));
      await staking.connect(alice).unstake(ethers.parseEther("10"));
      expect(await veBYND.balanceOf(alice.address)).to.equal(ethers.parseEther("10"));
      expect(await staking.totalStaked()).to.equal(0);
    });
  });

  describe("notifyRewardAmount", () => {
    it("only the configured distributor can notify rewards", async () => {
      const { staking, rewardTokenA, alice } = ctx;
      await rewardTokenA.mint(alice.address, ethers.parseEther("10"));
      await rewardTokenA.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
      await expect(
        staking.connect(alice).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("10"))
      ).to.be.revertedWith("ByNdStaking: not distributor");
    });

    it("no-ops (and does not pull funds) when totalStaked is zero", async () => {
      const { staking, rewardTokenA, deployer } = ctx;
      await rewardTokenA.mint(deployer.address, ethers.parseEther("10"));
      await rewardTokenA.approve(await staking.getAddress(), ethers.parseEther("10"));
      // deployer is the initial distributor before fixture rewires it to the voter,
      // so re-point it back for this isolated check
      await staking.setDistributor(deployer.address);
      await staking.notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("10"));
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(0);
      expect(await staking.rewardTokenCount()).to.equal(0);
    });

    it("registers a new reward token exactly once and accrues rewardPerToken", async () => {
      const { staking, veBYND, rewardTokenA, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      await rewardTokenA.mint(ctx.deployer.address, ethers.parseEther("10"));
      await rewardTokenA.approve(await staking.getAddress(), ethers.parseEther("10"));
      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("10"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("10"));
        await expect(
          staking.connect(voterSigner).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("10"))
        )
          .to.emit(staking, "RewardTokenAdded")
          .withArgs(await rewardTokenA.getAddress());
      });

      expect(await staking.rewardTokenCount()).to.equal(1);
      // Nothing has streamed yet in the notify block itself.
      expect(await staking.claimable(await rewardTokenA.getAddress(), alice.address)).to.equal(0);

      await time.increase(REWARDS_DURATION);
      expect(
        await staking.claimable(await rewardTokenA.getAddress(), alice.address)
      ).to.be.closeTo(ethers.parseEther("10"), DUST);
    });

    it("streams a notified reward linearly instead of crediting it all in one block", async () => {
      const { staking, veBYND, rewardTokenA, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("100"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("100"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("100"));
      });

      const token = await rewardTokenA.getAddress();
      expect(await staking.claimable(token, alice.address)).to.equal(0);

      await time.increase(REWARDS_DURATION / 2);
      // Half the window elapsed -> roughly half the value. Tolerance covers the
      // one-block drift `time.increase` introduces.
      expect(await staking.claimable(token, alice.address)).to.be.closeTo(
        ethers.parseEther("50"),
        ethers.parseEther("0.01")
      );

      await time.increase(REWARDS_DURATION);
      // Past periodFinish the stream stops rather than continuing to accrue.
      expect(await staking.claimable(token, alice.address)).to.be.closeTo(
        ethers.parseEther("100"),
        DUST
      );
    });

    it("defeats the atomic snipe: stake -> notify -> claim -> unstake in one window captures ~nothing", async () => {
      const { staking, veBYND, rewardTokenA, alice, bob } = ctx;
      const token = await rewardTokenA.getAddress();

      // A long-term staker holds the pool.
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      // The sniper front-runs the distribution with an equal stake...
      await giveVeBYND(bob, ethers.parseEther("100"));
      await veBYND.connect(bob).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(bob).stake(ethers.parseEther("100"));

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("100"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("100"));
        await staking.connect(voterSigner).notifyRewardAmount(token, ethers.parseEther("100"));
      });

      // ...and exits immediately. Pre-fix this captured 50 tokens at zero risk.
      await staking.connect(bob).claimReward(token);
      await staking.connect(bob).unstake(ethers.parseEther("100"));

      // A couple of blocks of accrual on half the pool is worth well under a
      // token out of 100 — the attack no longer pays for its own gas.
      expect(await rewardTokenA.balanceOf(bob.address)).to.be.lt(ethers.parseEther("0.01"));

      // And the value did not vanish: it keeps streaming to the staker who stayed.
      await time.increase(REWARDS_DURATION);
      expect(await staking.claimable(token, alice.address)).to.be.gt(ethers.parseEther("99"));
    });
  });

  describe("multi-token reward accounting", () => {
    it("splits two simultaneous reward tokens proportionally between two stakers", async () => {
      const { staking, veBYND, rewardTokenA, rewardTokenB, alice, bob } = ctx;
      await giveVeBYND(alice, ethers.parseEther("300"));
      await giveVeBYND(bob, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("300"));
      await veBYND.connect(bob).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("300"));
      await staking.connect(bob).stake(ethers.parseEther("100"));
      // alice = 75% of pool, bob = 25%

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("400"));
        await rewardTokenB.mint(voterSigner.address, ethers.parseEther("40"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("400"));
        await rewardTokenB.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("40"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("400"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenB.getAddress(), ethers.parseEther("40"));
      });

      // Let both streams run to completion before comparing shares — the split
      // is what matters here, not the streaming itself.
      await time.increase(REWARDS_DURATION);

      expect(await staking.claimable(await rewardTokenA.getAddress(), alice.address)).to.be.closeTo(ethers.parseEther("300"), DUST);
      expect(await staking.claimable(await rewardTokenA.getAddress(), bob.address)).to.be.closeTo(ethers.parseEther("100"), DUST);
      expect(await staking.claimable(await rewardTokenB.getAddress(), alice.address)).to.be.closeTo(ethers.parseEther("30"), DUST);
      expect(await staking.claimable(await rewardTokenB.getAddress(), bob.address)).to.be.closeTo(ethers.parseEther("10"), DUST);

      const [tokens, amounts] = await staking.claimableAll(alice.address);
      expect(tokens).to.deep.equal([
        await rewardTokenA.getAddress(),
        await rewardTokenB.getAddress(),
      ]);
      expect(amounts[0]).to.be.closeTo(ethers.parseEther("300"), DUST);
      expect(amounts[1]).to.be.closeTo(ethers.parseEther("30"), DUST);
    });

    it("claimAll pays out every accrued reward token and zeroes the claimable balance", async () => {
      const { staking, veBYND, rewardTokenA, rewardTokenB, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("10"));
        await rewardTokenB.mint(voterSigner.address, ethers.parseEther("5"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("10"));
        await rewardTokenB.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("5"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("10"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenB.getAddress(), ethers.parseEther("5"));
      });

      await time.increase(REWARDS_DURATION);
      await staking.connect(alice).claimAll();
      expect(await rewardTokenA.balanceOf(alice.address)).to.be.closeTo(ethers.parseEther("10"), DUST);
      expect(await rewardTokenB.balanceOf(alice.address)).to.be.closeTo(ethers.parseEther("5"), DUST);
      expect(await staking.claimable(await rewardTokenA.getAddress(), alice.address)).to.equal(0);
      expect(await staking.claimable(await rewardTokenB.getAddress(), alice.address)).to.equal(0);
    });

    it("claimReward pays out a single token without touching the others", async () => {
      const { staking, veBYND, rewardTokenA, rewardTokenB, alice } = ctx;
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("10"));
        await rewardTokenB.mint(voterSigner.address, ethers.parseEther("5"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("10"));
        await rewardTokenB.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("5"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("10"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenB.getAddress(), ethers.parseEther("5"));
      });

      await time.increase(REWARDS_DURATION);
      await staking.connect(alice).claimReward(await rewardTokenA.getAddress());
      expect(await rewardTokenA.balanceOf(alice.address)).to.be.closeTo(ethers.parseEther("10"), DUST);
      expect(await rewardTokenB.balanceOf(alice.address)).to.equal(0);
      expect(await staking.claimable(await rewardTokenB.getAddress(), alice.address)).to.be.closeTo(
        ethers.parseEther("5"),
        DUST
      );
    });

    it("a staker who joins mid-stream gets none of what already accrued, only a share of what streams after", async () => {
      const { staking, veBYND, rewardTokenA, alice, bob } = ctx;
      const token = await rewardTokenA.getAddress();
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("10"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("10"));
        await staking.connect(voterSigner).notifyRewardAmount(token, ethers.parseEther("10"));
      });

      // Alice alone for half the window -> she banks ~5.
      await time.increase(REWARDS_DURATION / 2);

      await giveVeBYND(bob, ethers.parseEther("100"));
      await veBYND.connect(bob).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(bob).stake(ethers.parseEther("100"));

      // Bob starts from zero: the accrual before his stake is not retroactive.
      expect(await staking.claimable(token, bob.address)).to.equal(0);
      const aliceAtJoin = await staking.claimable(token, alice.address);
      expect(aliceAtJoin).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.01"));

      // Remaining half streams 50/50 -> ~2.5 each. Under the old instant model
      // Bob would have got nothing at all, which over-rewarded early stakers for
      // value that had not yet been earned.
      await time.increase(REWARDS_DURATION);
      expect(await staking.claimable(token, bob.address)).to.be.closeTo(
        ethers.parseEther("2.5"),
        ethers.parseEther("0.01")
      );
      expect(await staking.claimable(token, alice.address)).to.be.closeTo(
        ethers.parseEther("7.5"),
        ethers.parseEther("0.01")
      );
    });
  });

  describe("admin", () => {
    it("only the owner can change the distributor", async () => {
      const { staking, alice } = ctx;
      await expect(
        staking.connect(alice).setDistributor(alice.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});

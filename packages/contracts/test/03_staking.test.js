const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit } = require("./fixtures");

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
      expect(await staking.claimable(await rewardTokenA.getAddress(), alice.address)).to.equal(
        ethers.parseEther("10")
      );
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

      expect(await staking.claimable(await rewardTokenA.getAddress(), alice.address)).to.equal(ethers.parseEther("300"));
      expect(await staking.claimable(await rewardTokenA.getAddress(), bob.address)).to.equal(ethers.parseEther("100"));
      expect(await staking.claimable(await rewardTokenB.getAddress(), alice.address)).to.equal(ethers.parseEther("30"));
      expect(await staking.claimable(await rewardTokenB.getAddress(), bob.address)).to.equal(ethers.parseEther("10"));

      const [tokens, amounts] = await staking.claimableAll(alice.address);
      expect(tokens).to.deep.equal([
        await rewardTokenA.getAddress(),
        await rewardTokenB.getAddress(),
      ]);
      expect(amounts).to.deep.equal([ethers.parseEther("300"), ethers.parseEther("30")]);
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

      await staking.connect(alice).claimAll();
      expect(await rewardTokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("10"));
      expect(await rewardTokenB.balanceOf(alice.address)).to.equal(ethers.parseEther("5"));
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

      await staking.connect(alice).claimReward(await rewardTokenA.getAddress());
      expect(await rewardTokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("10"));
      expect(await rewardTokenB.balanceOf(alice.address)).to.equal(0);
      expect(await staking.claimable(await rewardTokenB.getAddress(), alice.address)).to.equal(
        ethers.parseEther("5")
      );
    });

    it("a staker who joins after a notify gets none of that past reward", async () => {
      const { staking, veBYND, rewardTokenA, alice, bob } = ctx;
      await giveVeBYND(alice, ethers.parseEther("100"));
      await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(alice).stake(ethers.parseEther("100"));

      await asVoter(ctx, async (voterSigner) => {
        await rewardTokenA.mint(voterSigner.address, ethers.parseEther("10"));
        await rewardTokenA.connect(voterSigner).approve(await staking.getAddress(), ethers.parseEther("10"));
        await staking.connect(voterSigner).notifyRewardAmount(await rewardTokenA.getAddress(), ethers.parseEther("10"));
      });

      await giveVeBYND(bob, ethers.parseEther("100"));
      await veBYND.connect(bob).approve(await staking.getAddress(), ethers.parseEther("100"));
      await staking.connect(bob).stake(ethers.parseEther("100"));

      expect(await staking.claimable(await rewardTokenA.getAddress(), bob.address)).to.equal(0);
      expect(await staking.claimable(await rewardTokenA.getAddress(), alice.address)).to.equal(
        ethers.parseEther("10")
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

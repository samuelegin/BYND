const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll } = require("./fixtures");

describe("ByNdStaking — extra coverage", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  it("setDistributor reverts for non-owner and for the zero address", async () => {
    const { staking, alice, deployer } = ctx;
    await expect(
      staking.connect(alice).setDistributor(alice.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      staking.connect(deployer).setDistributor(ethers.ZeroAddress)
    ).to.be.revertedWith("ByNdStaking: zero address");
  });

  it("emits DistributorUpdated, Staked and Unstaked with correct args", async () => {
    const { staking, veBYND, deployer, alice } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));

    await expect(staking.setDistributor(deployer.address))
      .to.emit(staking, "DistributorUpdated")
      .withArgs(deployer.address);

    await expect(staking.connect(alice).stake(ethers.parseEther("4")))
      .to.emit(staking, "Staked")
      .withArgs(alice.address, ethers.parseEther("4"));

    await expect(staking.connect(alice).unstake(ethers.parseEther("1")))
      .to.emit(staking, "Unstaked")
      .withArgs(alice.address, ethers.parseEther("1"));
  });

  it("claimableAll returns parallel tokens/amounts arrays that match individual claimable() calls", async () => {
    const { staking, veBYND, deployer, alice, musd, rewardTokenA } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));
    await staking.setDistributor(deployer.address);

    for (const token of [musd, rewardTokenA]) {
      await token.mint(deployer.address, ethers.parseEther("1"));
      await token.connect(deployer).approve(await staking.getAddress(), ethers.parseEther("1"));
      await staking.notifyRewardAmount(await token.getAddress(), ethers.parseEther("1"));
    }

    const [tokens, amounts] = await staking.claimableAll(alice.address);
    expect(tokens.length).to.equal(2);
    for (let i = 0; i < tokens.length; i++) {
      expect(amounts[i]).to.equal(await staking.claimable(tokens[i], alice.address));
    }
  });

  it("rewardTokenCount only increases once per unique token, even across many notifies", async () => {
    const { staking, veBYND, deployer, alice, musd } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));
    await staking.setDistributor(deployer.address);

    expect(await staking.rewardTokenCount()).to.equal(0);
    for (let i = 0; i < 3; i++) {
      await musd.mint(deployer.address, 100);
      await musd.connect(deployer).approve(await staking.getAddress(), 100);
      await staking.notifyRewardAmount(await musd.getAddress(), 100);
    }
    expect(await staking.rewardTokenCount()).to.equal(1);
  });

  it("claimReward on a token the caller has zero claimable balance for is a safe no-op", async () => {
    const { staking, veBYND, deployer, alice, musd } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    // musd was never registered as a reward token at all — claiming it should
    // neither revert nor transfer anything.
    await expect(staking.connect(alice).claimReward(await musd.getAddress())).to.not.be.reverted;
    expect(await musd.balanceOf(alice.address)).to.equal(0);
  });
});

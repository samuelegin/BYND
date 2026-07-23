const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

describe("ByNdVoter — extra coverage", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function fastForwardToVoteWindow() {
    await jumpInsideVoteWindow(ctx.voter);
  }

  it("setEpochDuration rejects anything under 1 day and accepts exactly 1 day", async () => {
    const { voter } = ctx;
    await expect(voter.setEpochDuration(86399)).to.be.revertedWith(
      "ByNdVoter: too short"
    );
    await voter.setEpochDuration(86400);
    expect(await voter.epochDuration()).to.equal(86400);
  });

  it("setVoteWindow rejects anything above half the epoch duration and accepts the exact half", async () => {
    const { voter } = ctx;
    const epochDuration = await voter.epochDuration(); // 7 days by default
    await expect(voter.setVoteWindow(epochDuration / 2n + 1n)).to.be.revertedWith(
      "ByNdVoter: window too large"
    );
    await voter.setVoteWindow(epochDuration / 2n);
    expect(await voter.voteWindow()).to.equal(epochDuration / 2n);
  });

  it("setGauges reverts cleanly on a gauges/weights length mismatch instead of an out-of-bounds panic", async () => {
    const { voter, boostVoter, deployer, rewardTokenA } = ctx;
    const gauge = ethers.Wallet.createRandom().address;
    const bribe = ethers.Wallet.createRandom().address;
    await boostVoter.addGauge(gauge, bribe);

    await expect(
      voter
        .connect(deployer)
        .setGauges([gauge, gauge], [bribe, bribe], ["A", "B"], [10000], [[await rewardTokenA.getAddress()], []])
    ).to.be.revertedWith("ByNdVoter: length mismatch");
  });

  it("setGauges emits GaugesUpdated with the new gauge count", async () => {
    const { voter, boostVoter, deployer, rewardTokenA } = ctx;
    const gauge = ethers.Wallet.createRandom().address;
    const bribe = ethers.Wallet.createRandom().address;
    await boostVoter.addGauge(gauge, bribe);

    await expect(
      voter
        .connect(deployer)
        .setGauges([gauge], [bribe], ["A"], [10000], [[await rewardTokenA.getAddress()]])
    )
      .to.emit(voter, "GaugesUpdated")
      .withArgs(1);
  });

  it("setManagedTokenId replaces the previously tracked tokenId rather than appending to it", async () => {
    const { voter, deployer } = ctx;
    await voter.connect(deployer).setManagedTokenId(1);
    expect(await voter.managedTokenIds(0)).to.equal(1);

    await expect(voter.connect(deployer).setManagedTokenId(2))
      .to.emit(voter, "TokenIdAdded")
      .withArgs(2);

    // still exactly one managed tokenId, and it's the new one — the old
    // one's index-1-based mapping was cleared alongside the array.
    await expect(voter.managedTokenIds(1)).to.be.reverted; // out of bounds
    expect(await voter.managedTokenIds(0)).to.equal(2);
  });

  it("setTreasury and setBoostVoter actually update the stored addresses", async () => {
    const { voter, deployer, alice, boostVoter } = ctx;
    await voter.connect(deployer).setTreasury(alice.address);
    expect(await voter.treasury()).to.equal(alice.address);

    // point it at a fresh mock so we can prove the write actually landed
    const MockValidatorsVoter = await ethers.getContractFactory("MockValidatorsVoter");
    const newBoostVoter = await MockValidatorsVoter.deploy(await ctx.rewardTokenA.getAddress());
    await voter.connect(deployer).setBoostVoter(await newBoostVoter.getAddress());
    expect(await voter.boostVoter()).to.equal(await newBoostVoter.getAddress());
  });

  it("harvestAndDistribute emits Harvested and a KeeperPaid event per bounty recipient", async () => {
    const { voter, boostVoter, staking, veBYND, deployer, alice, rewardTokenA } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    const harvestAmount = ethers.parseEther("1000");
    await rewardTokenA.mint(deployer.address, harvestAmount);
    await rewardTokenA.connect(deployer).approve(await boostVoter.getAddress(), harvestAmount);
    await boostVoter.connect(deployer).seedBribe(bribe, harvestAmount);

    await voter.connect(deployer).setManagedTokenId(1);
    await fastForwardToVoteWindow();
    await voter.optimiseAndVote();

    const tx = await voter.harvestAndDistribute();
    await expect(tx).to.emit(voter, "Harvested");
    await expect(tx).to.emit(voter, "KeeperPaid");
  });
});

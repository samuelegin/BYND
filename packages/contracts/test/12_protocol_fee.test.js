const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

describe("ByNdVoter — protocol fee", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function fastForwardToVoteWindow() {
    await jumpInsideVoteWindow(ctx.voter);
  }

  it("defaults to 0 bps — existing deployments/behavior are unaffected until governance opts in", async () => {
    const { voter } = ctx;
    expect(await voter.protocolFeeBps()).to.equal(0);
  });

  it("setProtocolFeeBps reverts above 20% and reverts for non-governance callers", async () => {
    const { voter, alice, deployer } = ctx;
    await expect(voter.connect(alice).setProtocolFeeBps(100)).to.be.revertedWith(
      "ByNdVoter: not governance"
    );
    await expect(
      voter.connect(deployer).setProtocolFeeBps(2001)
    ).to.be.revertedWith("ByNdVoter: max 20%");
    await voter.connect(deployer).setProtocolFeeBps(2000); // exactly the cap is fine
    expect(await voter.protocolFeeBps()).to.equal(2000);
  });

  it("emits ProtocolFeeUpdated when changed", async () => {
    const { voter, deployer } = ctx;
    await expect(voter.connect(deployer).setProtocolFeeBps(500))
      .to.emit(voter, "ProtocolFeeUpdated")
      .withArgs(500);
  });

  it("routes exactly protocolFeeBps of each harvested token to treasury, before the keeper bounty and staker split", async () => {
    const { voter, boostVoter, staking, veBYND, deployer, alice, treasury, rewardTokenA } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    await voter.connect(deployer).setProtocolFeeBps(1000); // 10%
    await voter.connect(deployer).setBountyBps(0); // isolate the fee from the keeper bounty
    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    const harvestAmount = ethers.parseEther("1000");
    await rewardTokenA.mint(deployer.address, harvestAmount);
    await rewardTokenA.connect(deployer).approve(await boostVoter.getAddress(), harvestAmount);
    await boostVoter.connect(deployer).seedBribe(bribe, harvestAmount);

    await voter.connect(deployer).setManagedTokenId(1);
    await fastForwardToVoteWindow();
    await voter.optimiseAndVote();

    const treasuryBefore = await rewardTokenA.balanceOf(treasury.address);
    await expect(voter.harvestAndDistribute())
      .to.emit(voter, "ProtocolFeeCollected")
      .withArgs(0, await rewardTokenA.getAddress(), ethers.parseEther("100")); // 10% of 1000
    const treasuryAfter = await rewardTokenA.balanceOf(treasury.address);

    expect(treasuryAfter - treasuryBefore).to.equal(ethers.parseEther("100"));
  });

  it("conserves value: protocol fee + keeper bounty + staker amount never exceeds the harvested total", async () => {
    const { voter, boostVoter, staking, veBYND, deployer, alice, treasury, rewardTokenA } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    await voter.connect(deployer).setProtocolFeeBps(1234); // awkward, non-round bps
    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    const harvestAmount = 987654321n; // awkward amount too
    await rewardTokenA.mint(deployer.address, harvestAmount);
    await rewardTokenA.connect(deployer).approve(await boostVoter.getAddress(), harvestAmount);
    await boostVoter.connect(deployer).seedBribe(bribe, harvestAmount);

    await voter.connect(deployer).setManagedTokenId(1);
    await fastForwardToVoteWindow();
    await voter.optimiseAndVote();

    const treasuryBefore = await rewardTokenA.balanceOf(treasury.address);
    await voter.harvestAndDistribute();
    const treasuryAfter = await rewardTokenA.balanceOf(treasury.address);
    const feeAndBountyToTreasury = treasuryAfter - treasuryBefore;

    const stakerClaimable = await staking.claimable(await rewardTokenA.getAddress(), alice.address);

    // Recompute using the exact same integer arithmetic the contract uses,
    // so this is a precise check rather than a fuzzy dust tolerance.
    const MAX_BPS = 10000n;
    const protocolFee = (harvestAmount * 1234n) / MAX_BPS;
    const harvestedAfterFee = harvestAmount - protocolFee;
    const bountyBps = await voter.bountyBps(); // default 100 (1%)
    const sharePerKeeper = (harvestedAfterFee * bountyBps) / MAX_BPS / 5n;
    const actualBounty = sharePerKeeper * 5n;
    const expectedStakerAmount = harvestedAfterFee - actualBounty;
    // keepers[0]/[1] (claimRebases/extendLocks) were never recorded this
    // epoch, so they default to treasury; keepers[2] (optimiseAndVote
    // caller) and keepers[3] (harvestAndDistribute caller) are both
    // deployer here; keepers[4] is always treasury. So 3 of 5 shares land
    // on treasury, 2 of 5 land on deployer.
    const expectedTreasuryTotal = protocolFee + sharePerKeeper * 3n;

    expect(feeAndBountyToTreasury).to.equal(expectedTreasuryTotal);
    // staking's own rewardPerToken accounting has its own independent
    // truncation on top of this (covered separately in 07_economic_invariants),
    // so claimable can be slightly less than what was notified — never more.
    expect(stakerClaimable).to.be.lte(expectedStakerAmount);
    expect(expectedStakerAmount - stakerClaimable).to.be.lte(expectedStakerAmount / 1_000_000n + 10n);
    // and the three pieces together must never exceed what was harvested
    expect(feeAndBountyToTreasury + stakerClaimable).to.be.lte(harvestAmount);
  });

  it("a 0 bps fee (default) leaves the pre-existing bounty/staker split completely unchanged", async () => {
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
    await voter.harvestAndDistribute();

    // 1% bountyBps default, all 5 keeper slots effectively the same address
    // here (deployer/treasury), so entire bounty + remainder is still exactly
    // predictable: 99% of harvest reaches the staking pool as before.
    const stakerClaimable = await staking.claimable(await rewardTokenA.getAddress(), alice.address);
    expect(stakerClaimable).to.equal((harvestAmount * 9900n) / 10000n);
  });
});

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

const WEEK = 7 * 24 * 60 * 60;
const PoolId = { Staking: 0, LP: 1 };

describe("BYND + BYNDEmissions", function () {
  let admin, alice, bob;
  let bynd, emissions, veBYNDMock, lpMock;
  const CAP = ethers.parseEther("100000000"); // 100M BYND hard cap
  const RATE = ethers.parseEther("1"); // 1 BYND/sec combined at week 0, for fast test math

  beforeEach(async function () {
    [admin, alice, bob] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("MockERC20");
    veBYNDMock = await ERC20Mock.deploy("Mock veBYND", "veBYND", 18);
    lpMock = await ERC20Mock.deploy("Mock LP", "veBYND-MEZO-LP", 18);
    await veBYNDMock.waitForDeployment();
    await lpMock.waitForDeployment();

    const BYND = await ethers.getContractFactory("BYND");
    bynd = await BYND.deploy(admin.address, CAP);
    await bynd.waitForDeployment();

    const Emissions = await ethers.getContractFactory("BYNDEmissions");
    emissions = await Emissions.deploy(
      admin.address,
      await bynd.getAddress(),
      await veBYNDMock.getAddress(),
      await lpMock.getAddress(),
      RATE
    );
    await emissions.waitForDeployment();

    await bynd.grantRole(await bynd.MINTER_ROLE(), await emissions.getAddress());

    // fund alice/bob with mock stake tokens
    await veBYNDMock.mint(alice.address, ethers.parseEther("1000"));
    await veBYNDMock.mint(bob.address, ethers.parseEther("1000"));
    await lpMock.mint(alice.address, ethers.parseEther("1000"));

    await veBYNDMock.connect(alice).approve(await emissions.getAddress(), ethers.MaxUint256);
    await veBYNDMock.connect(bob).approve(await emissions.getAddress(), ethers.MaxUint256);
    await lpMock.connect(alice).approve(await emissions.getAddress(), ethers.MaxUint256);
  });

  it("deploys with correct cap and roles", async function () {
    expect(await bynd.cap()).to.equal(CAP);
    expect(await bynd.hasRole(await bynd.MINTER_ROLE(), await emissions.getAddress())).to.equal(true);
    expect(await emissions.hasRole(await emissions.ADMIN_ROLE(), admin.address)).to.equal(true);
  });

  it("single staker accrues ~100% of emissions for their pool share over time", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));

    await increaseTime(1000); // 1000 seconds at week-0 rate

    const earned = await emissions.earned(PoolId.Staking, alice.address);
    // staking pool gets (10000 - lpPoolWeightBps) = 3000 bps = 30% of combined rate by default
    const expected = (RATE * 1000n * 3000n) / 10000n;
    // allow small rounding tolerance from block timestamp granularity
    expect(earned).to.be.closeTo(expected, ethers.parseEther("0.01"));
  });

  it("splits rewards proportionally between two stakers in the same pool", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await emissions.connect(bob).stakeForRewards(ethers.parseEther("300")); // 3x alice

    // Long window relative to the ~1-2s gap between alice's and bob's stake
    // transactions (Hardhat advances the timestamp per-tx), so that head
    // start becomes a negligible fraction of the total instead of a fixed
    // absolute error the tolerance has to absorb.
    await increaseTime(100_000);

    const aliceEarned = await emissions.earned(PoolId.Staking, alice.address);
    const bobEarned = await emissions.earned(PoolId.Staking, bob.address);

    // bob has 3x alice's stake, so should earn ~3x, within a tolerance sized
    // for realistic block-timing noise, not exact-to-the-wei equality.
    expect(bobEarned).to.be.closeTo(aliceEarned * 3n, ethers.parseEther("2"));
  });

  it("actually mints BYND on claim, and zeroes accrued balance after", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await increaseTime(1000);

    const before = await bynd.balanceOf(alice.address);
    await emissions.connect(alice).claimStakingReward();
    const after = await bynd.balanceOf(alice.address);

    expect(after).to.be.gt(before);
    expect(await emissions.earned(PoolId.Staking, alice.address)).to.equal(0);
  });

  it("LP pool works once lpToken is set, and rejects staking before it's set", async function () {
    // redeploy with lpToken=0 to test the "not set yet" path
    const Emissions = await ethers.getContractFactory("BYNDEmissions");
    const emissions2 = await Emissions.deploy(
      admin.address,
      await bynd.getAddress(),
      await veBYNDMock.getAddress(),
      ethers.ZeroAddress,
      RATE
    );
    await emissions2.waitForDeployment();

    await lpMock.connect(alice).approve(await emissions2.getAddress(), ethers.MaxUint256);
    await expect(emissions2.connect(alice).stakeLp(ethers.parseEther("10")))
      .to.be.revertedWith("LP token not set");

    await emissions2.connect(admin).setLpToken(await lpMock.getAddress());
    await emissions2.connect(alice).stakeLp(ethers.parseEther("10"));
    expect(await emissions2.stakedBalanceOf(PoolId.LP, alice.address)).to.equal(ethers.parseEther("10"));
  });

  it("emission rate decays week over week", async function () {
    const week0Rate = await emissions.currentEmissionRate();
    await increaseTime(WEEK);
    const week1Rate = await emissions.currentEmissionRate();
    await increaseTime(WEEK);
    const week2Rate = await emissions.currentEmissionRate();

    expect(week1Rate).to.be.lt(week0Rate);
    expect(week2Rate).to.be.lt(week1Rate);

    // default 1.5% decay per week: week1 ≈ week0 * 0.985
    const expectedWeek1 = (week0Rate * 9850n) / 10000n;
    expect(week1Rate).to.be.closeTo(expectedWeek1, week0Rate / 1000n);
  });

  it("withdraw reduces stake and stops further accrual on the withdrawn amount", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await increaseTime(500);
    await emissions.connect(alice).withdrawStaked(ethers.parseEther("100"));

    const earnedAtWithdraw = await emissions.earned(PoolId.Staking, alice.address);
    await increaseTime(500);
    const earnedAfterMoreTime = await emissions.earned(PoolId.Staking, alice.address);

    // alice has 0 staked now, so earned() shouldn't grow further
    expect(earnedAfterMoreTime).to.equal(earnedAtWithdraw);
    expect(await veBYNDMock.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
  });

  it("claimAll pays out both pools in one call", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await emissions.connect(alice).stakeLp(ethers.parseEther("100"));
    await increaseTime(1000);

    const before = await bynd.balanceOf(alice.address);
    await emissions.connect(alice).claimAll();
    const after = await bynd.balanceOf(alice.address);

    expect(after).to.be.gt(before);
    expect(await emissions.earned(PoolId.Staking, alice.address)).to.equal(0);
    expect(await emissions.earned(PoolId.LP, alice.address)).to.equal(0);
  });

  it("only ADMIN_ROLE can change params or set the LP token", async function () {
    await expect(emissions.connect(alice).setParams(9000, 6000)).to.be.reverted;
    await expect(emissions.connect(alice).setLpToken(await lpMock.getAddress())).to.be.reverted;

    await emissions.connect(admin).setParams(9000, 6000);
    expect(await emissions.weeklyDecayBps()).to.equal(9000);
    expect(await emissions.lpPoolWeightBps()).to.equal(6000);
  });

  it("permissionless checkpoint() settles pending rewardPerToken without reverting", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await increaseTime(1000);
    await expect(emissions.connect(bob).checkpoint()).to.not.be.reverted;
  });

  it("BYND mint respects the hard cap", async function () {
    const TinyBYND = await ethers.getContractFactory("BYND");
    const tinyCap = ethers.parseEther("1"); // absurdly small cap to force overflow
    const tinyBynd = await TinyBYND.deploy(admin.address, tinyCap);
    await tinyBynd.waitForDeployment();
    await tinyBynd.grantRole(await tinyBynd.MINTER_ROLE(), admin.address);

    await tinyBynd.connect(admin).mint(alice.address, tinyCap);
    await expect(tinyBynd.connect(admin).mint(alice.address, 1)).to.be.reverted;
  });
});

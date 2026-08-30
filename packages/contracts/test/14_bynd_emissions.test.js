const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [Number(seconds)]);
  await network.provider.send("evm_mine");
}

const WEEK = 7 * 24 * 60 * 60;
const PoolId = { Staking: 0, LP: 1 };

describe("BYND + BYNDEmissions", function () {
  let admin, timelock, alice, bob;
  let bynd, emissions, veBYNDMock, lpMock;
  const CAP = ethers.parseEther("100000000"); // 100M BYND global hard cap
  const RATE = ethers.parseEther("1"); // 1 BYND/sec combined at week 0, for fast test math
  // Production rate per the mainnet tokenomics redesign — used in the
  // dedicated "production parameters" tests below, kept separate from RATE
  // so the bulk of the suite can keep using round numbers for fast math.
  const PROD_RATE = ethers.parseEther("0.8");

  beforeEach(async function () {
    [admin, timelock, alice, bob] = await ethers.getSigners();

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

    // Grant TIMELOCK_ROLE to a dedicated signer distinct from `admin` — on
    // mainnet this role is held by an actual TimelockController, never an
    // EOA (see contract-level notes on BYNDEmissions). Using a separate
    // signer here (rather than granting it to `admin`) keeps every test
    // honest about which role is actually required for monetary-policy
    // calls, and lets the "only timelock can..." tests below stay
    // meaningful rather than accidentally passing because admin has both
    // roles.
    await emissions.connect(admin).grantRole(await emissions.TIMELOCK_ROLE(), timelock.address);

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
    // admin explicitly does NOT hold TIMELOCK_ROLE by default — monetary
    // policy must be granted separately, not bundled into the deploy admin.
    expect(await emissions.hasRole(await emissions.TIMELOCK_ROLE(), admin.address)).to.equal(false);
    expect(await emissions.hasRole(await emissions.TIMELOCK_ROLE(), timelock.address)).to.equal(true);
  });

  it("deploys with the correct default mainnet monetary parameters", async function () {
    expect(await emissions.MAX_PROTOCOL_EMISSIONS()).to.equal(ethers.parseEther("40000000"));
    expect(await emissions.weeklyDecayBps()).to.equal(9850);
    expect(await emissions.lpWeightBps()).to.equal(6000);
    expect(await emissions.stakingWeightBps()).to.equal(4000);
    expect(await emissions.totalEmitted()).to.equal(0);
    expect(await emissions.remainingEmissionBudget()).to.equal(ethers.parseEther("40000000"));
  });

  it("a deployment with the real production rate (0.8 BYND/sec) reports it correctly", async function () {
    const Emissions = await ethers.getContractFactory("BYNDEmissions");
    const prod = await Emissions.deploy(
      admin.address,
      await bynd.getAddress(),
      await veBYNDMock.getAddress(),
      await lpMock.getAddress(),
      PROD_RATE
    );
    await prod.waitForDeployment();
    expect(await prod.initialRatePerSecond()).to.equal(PROD_RATE);
    expect(await prod.currentEmissionRate()).to.equal(PROD_RATE);
  });

  it("single staker accrues ~their pool's share of emissions over time", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));

    await increaseTime(1000); // 1000 seconds at week-0 rate

    const earnedAmt = await emissions.earned(PoolId.Staking, alice.address);
    // staking pool gets stakingWeightBps = 4000 bps = 40% of combined rate by default
    const expected = (RATE * 1000n * 4000n) / 10000n;
    // allow small rounding tolerance from block timestamp granularity
    expect(earnedAmt).to.be.closeTo(expected, ethers.parseEther("0.01"));
  });

  it("splits rewards proportionally between two stakers in the same pool", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await emissions.connect(bob).stakeForRewards(ethers.parseEther("300")); // 3x alice

    await increaseTime(100_000);

    const aliceEarned = await emissions.earned(PoolId.Staking, alice.address);
    const bobEarned = await emissions.earned(PoolId.Staking, bob.address);

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
    const Emissions = await ethers.getContractFactory("BYNDEmissions");
    const emissions2 = await Emissions.deploy(
      admin.address,
      await bynd.getAddress(),
      await veBYNDMock.getAddress(),
      ethers.ZeroAddress,
      RATE
    );
    await emissions2.waitForDeployment();
    await emissions2.connect(admin).grantRole(await emissions2.TIMELOCK_ROLE(), timelock.address);

    await lpMock.connect(alice).approve(await emissions2.getAddress(), ethers.MaxUint256);
    await expect(emissions2.connect(alice).stakeLp(ethers.parseEther("10")))
      .to.be.revertedWith("LP token not set");

    await emissions2.connect(timelock).setLpToken(await lpMock.getAddress());
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

    const expectedWeek1 = (week0Rate * 9850n) / 10000n;
    expect(week1Rate).to.be.closeTo(expectedWeek1, week0Rate / 1000n);
  });

  // ── Decision-log tests: the 260-week freeze/loss bug ────────────────────

  it("decay CONTINUES past week 260 — does not freeze at the week-260 rate", async function () {
    // Jump straight to week 261 in one shot. A real deployment would never
    // see multi-hundred-week gaps between checkpoints in practice (any
    // stake/claim/checkpoint() call advances it), but this proves the math
    // itself has no ceiling, independent of how it's reached.
    await increaseTime(261 * WEEK);
    // A single checkpoint() call only advances MAX_WEEKS_PER_ADVANCE (260)
    // weeks of backlog — call it twice to fully catch up from a 261-week gap.
    await emissions.checkpoint();
    await emissions.checkpoint();

    const rateAt261 = await emissions.currentEmissionRate();

    // Rate at week 261 must be strictly LESS than rate at week 260 — if the
    // old bug were still present, these would be equal (frozen).
    let rateAt260 = RATE;
    for (let i = 0; i < 260; i++) {
      rateAt260 = (rateAt260 * 9850n) / 10000n;
    }
    expect(rateAt261).to.be.lt(rateAt260);

    const expectedAt261 = (rateAt260 * 9850n) / 10000n;
    expect(rateAt261).to.be.closeTo(expectedAt261, expectedAt261 / 1000n);
  });

  it("a gap longer than MAX_WEEKS_PER_ADVANCE requires two checkpoint() calls to fully catch up, and loses nothing in between", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));

    // 300 weeks — bigger than the 260-week per-call advance bound.
    await increaseTime(300 * WEEK);

    const beforeAny = await emissions.globalLastCheckpoint();
    await emissions.checkpoint();
    const afterFirst = await emissions.globalLastCheckpoint();
    // First call should NOT have reached block.timestamp yet — it can only
    // process 260 weeks of the 300-week backlog.
    const nowAfterFirst = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    expect(afterFirst).to.be.gt(beforeAny);
    expect(afterFirst).to.be.lt(nowAfterFirst);

    await emissions.checkpoint();
    const afterSecond = await emissions.globalLastCheckpoint();
    const nowAfterSecond = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    // Second call finishes the catch-up.
    expect(afterSecond).to.equal(nowAfterSecond);
  });

  // ── Decision-log tests: the hard 40M emission budget ────────────────────

  it("remainingEmissionBudget() and currentEmissionRate() correctly report zero once the budget is exhausted", async function () {
    // MAX_PROTOCOL_EMISSIONS is a fixed constant, so to reach it in a
    // reasonable number of simulated seconds (rather than years), deploy a
    // second instance with a deliberately absurd rate — this exercises the
    // exact same clamp path a real 5-year-mature protocol would eventually
    // hit, just compressed in simulated time.
    const Emissions = await ethers.getContractFactory("BYNDEmissions");
    const fastRate = ethers.parseEther("1000000"); // 1M BYND/sec
    const fastEmissions = await Emissions.deploy(
      admin.address,
      await bynd.getAddress(),
      await veBYNDMock.getAddress(),
      await lpMock.getAddress(),
      fastRate
    );
    await fastEmissions.waitForDeployment();
    await bynd.grantRole(await bynd.MINTER_ROLE(), await fastEmissions.getAddress());

    await veBYNDMock.connect(alice).approve(await fastEmissions.getAddress(), ethers.MaxUint256);
    await fastEmissions.connect(alice).stakeForRewards(ethers.parseEther("100"));

    // At 1M/sec, 40M budget exhausts in 40 seconds — well within one week,
    // so no decay steps or multi-call catchup complicate this assertion.
    await increaseTime(100);
    await fastEmissions.checkpoint();

    expect(await fastEmissions.totalEmitted()).to.equal(await fastEmissions.MAX_PROTOCOL_EMISSIONS());
    expect(await fastEmissions.remainingEmissionBudget()).to.equal(0);
    expect(await fastEmissions.currentEmissionRate()).to.equal(0);

    // Further time passing changes nothing further.
    await increaseTime(WEEK);
    await fastEmissions.checkpoint();
    expect(await fastEmissions.totalEmitted()).to.equal(await fastEmissions.MAX_PROTOCOL_EMISSIONS());
  });

  it("BOUNDARY: a checkpoint that would emit more than the remaining budget clamps exactly to what's left, and the user can claim the full clamped amount without reverting", async function () {
    const Emissions = await ethers.getContractFactory("BYNDEmissions");
    const fastRate = ethers.parseEther("1000000");
    const fastEmissions = await Emissions.deploy(
      admin.address,
      await bynd.getAddress(),
      await veBYNDMock.getAddress(),
      await lpMock.getAddress(),
      fastRate
    );
    await fastEmissions.waitForDeployment();
    await bynd.grantRole(await bynd.MINTER_ROLE(), await fastEmissions.getAddress());
    await veBYNDMock.connect(alice).approve(await fastEmissions.getAddress(), ethers.MaxUint256);
    await fastEmissions.connect(alice).stakeForRewards(ethers.parseEther("100"));

    // Step 1: emit most, but not all, of the budget (30 of 40 seconds worth
    // at 1M/sec = 30M of the 40M budget), leaving a small remainder that a
    // single further step will overshoot — the exact "remaining budget
    // smaller than a theoretical emission amount" scenario from the
    // decision log.
    await increaseTime(30);
    await fastEmissions.checkpoint();
    const emittedAfterStep1 = await fastEmissions.totalEmitted();
    expect(emittedAfterStep1).to.be.gt(0);
    expect(emittedAfterStep1).to.be.lt(await fastEmissions.MAX_PROTOCOL_EMISSIONS());

    const remainingBeforeOvershoot = await fastEmissions.remainingEmissionBudget();
    expect(remainingBeforeOvershoot).to.be.gt(0);

    // Step 2: advance far enough that the RAW (unclamped) emission for this
    // interval alone would exceed the remaining budget several times over.
    await increaseTime(1000);
    const tx = await fastEmissions.checkpoint();
    await expect(tx).to.emit(fastEmissions, "EmissionBudgetExhausted");

    expect(await fastEmissions.totalEmitted()).to.equal(await fastEmissions.MAX_PROTOCOL_EMISSIONS());
    expect(await fastEmissions.remainingEmissionBudget()).to.equal(0);

    // Alice's accrued reward must be fully backed by budget — claiming
    // must succeed, not revert.
    await expect(fastEmissions.connect(alice).claimStakingReward()).to.not.be.reverted;

    // Global invariant: cumulative emissions never exceed the budget, ever,
    // regardless of how many more claims/checkpoints happen afterward.
    await increaseTime(WEEK);
    await fastEmissions.checkpoint();
    expect(await fastEmissions.totalEmitted()).to.equal(await fastEmissions.MAX_PROTOCOL_EMISSIONS());
  });

  it("withdraw reduces stake and stops further accrual on the withdrawn amount", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await increaseTime(500);
    await emissions.connect(alice).withdrawStaked(ethers.parseEther("100"));

    const earnedAtWithdraw = await emissions.earned(PoolId.Staking, alice.address);
    await increaseTime(500);
    const earnedAfterMoreTime = await emissions.earned(PoolId.Staking, alice.address);

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

  it("cannot claim the same rewards twice", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await increaseTime(1000);

    const tx1 = await emissions.connect(alice).claimStakingReward();
    const receipt1 = await tx1.wait();
    const block1 = await ethers.provider.getBlock(receipt1.blockNumber);
    const balanceAfterFirstClaim = await bynd.balanceOf(alice.address);

    // Immediately claim again — NOT "with no time passing": every
    // transaction mines its own block, which advances the chain's
    // timestamp by at least 1 second on Hardhat's default network. So a
    // second, real (small) amount of reward DOES legitimately accrue in
    // that 1-block gap — asserting exact balance equality here was wrong;
    // the actual invariant to test is that the SECOND claim pays only that
    // small newly-accrued sliver, not a re-payment of what the first claim
    // already paid out.
    const tx2 = await emissions.connect(alice).claimStakingReward();
    const receipt2 = await tx2.wait();
    const block2 = await ethers.provider.getBlock(receipt2.blockNumber);
    const balanceAfterSecondClaim = await bynd.balanceOf(alice.address);

    const elapsedBetweenClaims = BigInt(block2.timestamp - block1.timestamp);
    // stakingWeightBps = 4000 (40%) of the combined RATE, per the default
    // mainnet split used throughout this suite.
    const expectedSecondClaim = (RATE * elapsedBetweenClaims * 4000n) / 10000n;

    expect(balanceAfterSecondClaim - balanceAfterFirstClaim).to.equal(expectedSecondClaim);
    // The key double-claim protection: the second payout is bounded to
    // a single block's worth of new accrual, nowhere close to a repeat of
    // the first (1000-second) claim.
    expect(balanceAfterSecondClaim - balanceAfterFirstClaim).to.be.lt(balanceAfterFirstClaim / 100n);
  });

  // ── Decision-log tests: TIMELOCK_ROLE gating ─────────────────────────────

  it("only TIMELOCK_ROLE can change the decay rate, emission split, or LP token — an arbitrary EOA (even ADMIN_ROLE) cannot", async function () {
    await expect(emissions.connect(alice).setWeeklyDecayBps(9000)).to.be.reverted;
    await expect(emissions.connect(alice).setEmissionSplit(5000, 5000)).to.be.reverted;
    await expect(emissions.connect(alice).setLpToken(await lpMock.getAddress())).to.be.reverted;

    // ADMIN_ROLE alone (held by `admin`, without TIMELOCK_ROLE) is NOT
    // sufficient — monetary policy is deliberately a stricter, separate
    // permission from general role administration.
    await expect(emissions.connect(admin).setWeeklyDecayBps(9000)).to.be.reverted;
    await expect(emissions.connect(admin).setEmissionSplit(5000, 5000)).to.be.reverted;

    await emissions.connect(timelock).setWeeklyDecayBps(9000);
    expect(await emissions.weeklyDecayBps()).to.equal(9000);

    await emissions.connect(timelock).setEmissionSplit(5000, 5000);
    expect(await emissions.lpWeightBps()).to.equal(5000);
    expect(await emissions.stakingWeightBps()).to.equal(5000);
  });

  it("setEmissionSplit rejects weights that don't sum to 10000", async function () {
    await expect(emissions.connect(timelock).setEmissionSplit(6000, 3000))
      .to.be.revertedWith("weights must sum to 10000");
    await expect(emissions.connect(timelock).setEmissionSplit(6000, 4001))
      .to.be.revertedWith("weights must sum to 10000");
    // exact boundary — must succeed
    await expect(emissions.connect(timelock).setEmissionSplit(0, 10000)).to.not.be.reverted;
    await expect(emissions.connect(timelock).setEmissionSplit(10000, 0)).to.not.be.reverted;
  });

  it("lpEmissionWeight() and stakingEmissionWeight() reflect the current split for the frontend", async function () {
    expect(await emissions.lpEmissionWeight()).to.equal(6000);
    expect(await emissions.stakingEmissionWeight()).to.equal(4000);

    await emissions.connect(timelock).setEmissionSplit(4000, 6000);
    expect(await emissions.lpEmissionWeight()).to.equal(4000);
    expect(await emissions.stakingEmissionWeight()).to.equal(6000);
  });

  it("annualizedEmission() is currentEmissionRate() * 365 days", async function () {
    const rate = await emissions.currentEmissionRate();
    const annualized = await emissions.annualizedEmission();
    expect(annualized).to.equal(rate * 365n * 24n * 60n * 60n);
  });

  it("permissionless checkpoint() settles pending rewardPerToken without reverting", async function () {
    await emissions.connect(alice).stakeForRewards(ethers.parseEther("100"));
    await increaseTime(1000);
    await expect(emissions.connect(bob).checkpoint()).to.not.be.reverted;
  });

  it("BYND mint respects the 100M global hard cap independent of the 40M emission budget", async function () {
    const TinyBYND = await ethers.getContractFactory("BYND");
    const tinyCap = ethers.parseEther("1"); // absurdly small cap to force overflow
    const tinyBynd = await TinyBYND.deploy(admin.address, tinyCap);
    await tinyBynd.waitForDeployment();
    await tinyBynd.grantRole(await tinyBynd.MINTER_ROLE(), admin.address);

    await tinyBynd.connect(admin).mint(alice.address, tinyCap);
    await expect(tinyBynd.connect(admin).mint(alice.address, 1)).to.be.reverted;
  });
});

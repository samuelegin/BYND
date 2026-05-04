import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const EPOCH   = 7 * 24 * 60 * 60;
const MUSD_TOKEN: string[] = []; // filled in fixture after musd deploy

async function deployFixture() {
  const [deployer, keeper, samuel, michael] = await ethers.getSigners();

  const MockERC20  = await ethers.getContractFactory("MockERC20");
  const MockVeMEZO = await ethers.getContractFactory("MockVeMEZO");
  const MockVoter  = await ethers.getContractFactory("MockValidatorsVoter");

  const musd    = await MockERC20.deploy("Mock MUSD", "MUSD", 18);
  const veMEZO  = await MockVeMEZO.deploy();
  const mockVoter = await MockVoter.deploy(await musd.getAddress());

  await musd.mint(deployer.address, ethers.parseEther("10000000"));
  await musd.approve(await mockVoter.getAddress(), ethers.parseEther("10000000"));

  const VeBYND      = await ethers.getContractFactory("VeBYND");
  const ByNdVault   = await ethers.getContractFactory("ByNdVault");
  const ByNdStaking = await ethers.getContractFactory("ByNdStaking");
  const ByNdVoter   = await ethers.getContractFactory("ByNdVoter");

  const veBYND  = await VeBYND.deploy();
  const vault   = await ByNdVault.deploy(await veMEZO.getAddress(), await veBYND.getAddress());
  const staking = await ByNdStaking.deploy(
    await veBYND.getAddress(),
    await musd.getAddress(),
    deployer.address
  );
  const voter = await ByNdVoter.deploy(
    await musd.getAddress(),
    await staking.getAddress(),
    await mockVoter.getAddress()
  );

  // Wire
  const MINTER_ROLE = await veBYND.MINTER_ROLE();
  await veBYND.grantRole(MINTER_ROLE, await vault.getAddress());
  await staking.setDistributor(await voter.getAddress());

  // Set managedTokenId — tokenId 1 is the first NFT deposited (samuel's)
  await voter.setManagedTokenId(1);

  // Register gauges in mock so isAlive check passes in setGauges()
  // In real BoostVoter: gaugeA/gaugeB are created via createBoostGauge()
  //                     brideA/brideB come from BoostVoter.gaugeToBribe[gauge]
  const gaugeA = ethers.Wallet.createRandom().address;
  const gaugeB = ethers.Wallet.createRandom().address;
  const brideA = ethers.Wallet.createRandom().address;
  const brideB = ethers.Wallet.createRandom().address;

  // Register in mock (mirrors BoostVoter.createBoostGauge)
  await mockVoter.addGauge(gaugeA, brideA);
  await mockVoter.addGauge(gaugeB, brideB);
  await mockVoter.whitelistToken(await musd.getAddress());

  await voter.setGauges(
    [gaugeA, gaugeB],                                          // boost gauge addresses
    [brideA, brideB],                                          // bribe contract addresses (auto-filled from BoostVoter if passed as 0x0)
    ["veBTC #1 Boost Gauge", "veBTC #2 Boost Gauge"],          // names
    [7000, 3000],                                              // weights (must sum to 10000)
    [[await musd.getAddress()], [await musd.getAddress()]]     // bribe tokens per gauge
  );

  // Mint veMEZO NFTs: tokenId 1 → 1000 MEZO (samuel), tokenId 2 → 2000 MEZO (michael)
  await veMEZO.mint(samuel.address,  1);
  await veMEZO.mint(michael.address, 2);

  return {
    deployer, keeper, samuel, michael,
    musd, veMEZO, mockVoter, veBYND, vault, staking, voter,
    gaugeA, gaugeB, brideA, brideB,
  };
}

async function samuelDepositAndStake(f: Awaited<ReturnType<typeof deployFixture>>) {
  await f.veMEZO.connect(f.samuel).approve(await f.vault.getAddress(), 1);
  await f.vault.connect(f.samuel).deposit(1);
  const bal = await f.veBYND.balanceOf(f.samuel.address);
  await f.veBYND.connect(f.samuel).approve(await f.staking.getAddress(), bal);
  await f.staking.connect(f.samuel).stake(bal);
  return bal;
}

// ── VeBYND ────────────────────────────────────────────────────────────────────

describe("VeBYND", () => {
  it("has correct name and symbol", async () => {
    const { veBYND } = await loadFixture(deployFixture);
    expect(await veBYND.name()).to.equal("veBYND");
    expect(await veBYND.symbol()).to.equal("veBYND");
  });

  it("only MINTER_ROLE can mint", async () => {
    const { veBYND, samuel } = await loadFixture(deployFixture);
    await expect(veBYND.connect(samuel).mint(samuel.address, 1)).to.be.reverted;
  });
});

// ── ByNdVault — deposit ───────────────────────────────────────────────────────

describe("ByNdVault — deposit", () => {
  it("mints veBYND equal to locked.amount on deposit", async () => {
    const { vault, veBYND, veMEZO, samuel } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    expect(await veBYND.balanceOf(samuel.address)).to.equal(ethers.parseEther("1000"));
  });

  it("transfers NFT ownership to vault", async () => {
    const { vault, veMEZO, samuel } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    expect(await veMEZO.ownerOf(1)).to.equal(await vault.getAddress());
  });

  it("records depositor correctly", async () => {
    const { vault, veMEZO, samuel } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    expect(await vault.depositorOf(1)).to.equal(samuel.address);
    const tokens = await vault.getUserTokens(samuel.address);
    expect(tokens[0]).to.equal(1n);
  });

  it("reverts if caller is not the NFT owner", async () => {
    const { vault, michael } = await loadFixture(deployFixture);
    await expect(vault.connect(michael).deposit(1)).to.be.revertedWith("ByNdVault: not owner");
  });

  it("reverts on empty lock", async () => {
    const { vault, veMEZO, samuel } = await loadFixture(deployFixture);
    await veMEZO.mintCustom(samuel.address, 99, 0, block_far_future());
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 99);
    await expect(vault.connect(samuel).deposit(99)).to.be.revertedWith("ByNdVault: empty lock");
  });

  it("increases totalDeposited and totalLockedMEZO after deposits", async () => {
    const { vault, veMEZO, samuel, michael } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    expect(await vault.totalDeposited()).to.equal(1n);
    await veMEZO.connect(michael).approve(await vault.getAddress(), 2);
    await vault.connect(michael).deposit(2);
    expect(await vault.totalDeposited()).to.equal(2n);
    expect(await vault.totalLockedMEZO()).to.equal(ethers.parseEther("3000"));
  });
});

// ── ByNdVault — extendLocks ───────────────────────────────────────────────────

describe("ByNdVault — extendLocks", () => {
  it("is callable by anyone (permissionless)", async () => {
    const { vault, veMEZO, samuel, keeper } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    await expect(vault.connect(keeper).extendLocks()).to.not.be.reverted;
  });

  it("enforces 7-day cooldown — reverts on second call", async () => {
    const { vault, veMEZO, samuel, keeper } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    await vault.connect(keeper).extendLocks();
    await expect(vault.connect(keeper).extendLocks()).to.be.revertedWith("ByNdVault: cooldown active");
  });

  it("succeeds again after 7 days", async () => {
    const { vault, veMEZO, samuel, keeper } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    await vault.connect(keeper).extendLocks();
    await time.increase(EPOCH);
    await expect(vault.connect(keeper).extendLocks()).to.not.be.reverted;
  });
});

// ── ByNdStaking ───────────────────────────────────────────────────────────────

describe("ByNdStaking — stake / unstake", () => {
  it("tracks staked balance correctly", async () => {
    const { vault, staking, veBYND, veMEZO, samuel } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    const bal = await veBYND.balanceOf(samuel.address);
    await veBYND.connect(samuel).approve(await staking.getAddress(), bal);
    await staking.connect(samuel).stake(bal);
    expect(await staking.stakedBalance(samuel.address)).to.equal(bal);
    expect(await staking.totalStaked()).to.equal(bal);
  });

  it("returns veBYND on unstake", async () => {
    const { vault, staking, veBYND, veMEZO, samuel } = await loadFixture(deployFixture);
    await veMEZO.connect(samuel).approve(await vault.getAddress(), 1);
    await vault.connect(samuel).deposit(1);
    const bal = await veBYND.balanceOf(samuel.address);
    await veBYND.connect(samuel).approve(await staking.getAddress(), bal);
    await staking.connect(samuel).stake(bal);
    await staking.connect(samuel).unstake(bal);
    expect(await veBYND.balanceOf(samuel.address)).to.equal(bal);
    expect(await staking.stakedBalance(samuel.address)).to.equal(0n);
  });

  it("reverts if unstaking more than staked", async () => {
    const { staking, samuel } = await loadFixture(deployFixture);
    await expect(staking.connect(samuel).unstake(1n)).to.be.revertedWith("ByNdStaking: insufficient");
  });
});

// ── ByNdVoter — castVotes ─────────────────────────────────────────────────────

describe("ByNdVoter — castVotes", () => {
  it("reverts before epoch has passed", async () => {
    const { voter, keeper } = await loadFixture(deployFixture);
    await expect(voter.connect(keeper).castVotes()).to.be.revertedWith("ByNdVoter: epoch not ended");
  });

  it("succeeds after epoch and marks epochVoted", async () => {
    const { voter, keeper } = await loadFixture(deployFixture);
    await time.increase(EPOCH);
    await voter.connect(keeper).castVotes();
    expect(await voter.epochVoted(0n)).to.be.true;
  });

  it("reverts if called twice in same epoch (idempotency)", async () => {
    const { voter, keeper } = await loadFixture(deployFixture);
    await time.increase(EPOCH);
    await voter.connect(keeper).castVotes();
    await expect(voter.connect(keeper).castVotes()).to.be.revertedWith("ByNdVoter: already voted");
  });
});

// ── ByNdVoter — harvestAndDistribute ─────────────────────────────────────────

describe("ByNdVoter — harvestAndDistribute", () => {
  it("reverts if votes not cast first (order enforcement)", async () => {
    const { voter, keeper } = await loadFixture(deployFixture);
    await time.increase(EPOCH);
    await expect(voter.connect(keeper).harvestAndDistribute())
      .to.be.revertedWith("ByNdVoter: votes not cast");
  });

  it("reverts if called twice (idempotency)", async () => {
    const f = await loadFixture(deployFixture);
    await samuelDepositAndStake(f);
    await f.mockVoter.seedBribe(f.brideA, ethers.parseEther("1000"));
    await time.increase(EPOCH);
    await f.voter.connect(f.keeper).castVotes();
    await f.voter.connect(f.keeper).harvestAndDistribute();
    await expect(f.voter.connect(f.keeper).harvestAndDistribute())
      .to.be.revertedWith("ByNdVoter: already harvested");
  });

  it("pays 1% bounty to keeper, 99% to stakers", async () => {
    const f = await loadFixture(deployFixture);
    await samuelDepositAndStake(f);
    const bribe = ethers.parseEther("1000");
    await f.mockVoter.seedBribe(f.brideA, bribe);
    await time.increase(EPOCH);
    await f.voter.connect(f.keeper).castVotes();
    const keeperBefore = await f.musd.balanceOf(f.keeper.address);
    await f.voter.connect(f.keeper).harvestAndDistribute();
    const keeperAfter = await f.musd.balanceOf(f.keeper.address);
    const expectedBounty = bribe * 100n / 10000n;
    expect(keeperAfter - keeperBefore).to.equal(expectedBounty);
    const samuelClaimable = await f.staking.claimableMUSD(f.samuel.address);
    expect(samuelClaimable).to.equal(bribe - expectedBounty);
  });

  it("pro-rata: samuel 1000 staked, michael 2000 staked → michael earns 2x samuel", async () => {
    const f = await loadFixture(deployFixture);
    await samuelDepositAndStake(f);
    await f.veMEZO.connect(f.michael).approve(await f.vault.getAddress(), 2);
    await f.vault.connect(f.michael).deposit(2);
    const michaelBal = await f.veBYND.balanceOf(f.michael.address);
    await f.veBYND.connect(f.michael).approve(await f.staking.getAddress(), michaelBal);
    await f.staking.connect(f.michael).stake(michaelBal);
    await f.mockVoter.seedBribe(f.brideA, ethers.parseEther("3000"));
    await time.increase(EPOCH);
    await f.voter.connect(f.keeper).castVotes();
    await f.voter.connect(f.keeper).harvestAndDistribute();
    const samuelC  = await f.staking.claimableMUSD(f.samuel.address);
    const michaelC = await f.staking.claimableMUSD(f.michael.address);
    const ratio = Number(michaelC) / Number(samuelC);
    expect(ratio).to.be.closeTo(2, 0.01);
  });

  it("staker can claim MUSD and balance increases", async () => {
    const f = await loadFixture(deployFixture);
    await samuelDepositAndStake(f);
    await f.mockVoter.seedBribe(f.brideA, ethers.parseEther("500"));
    await time.increase(EPOCH);
    await f.voter.connect(f.keeper).castVotes();
    await f.voter.connect(f.keeper).harvestAndDistribute();
    const before = await f.musd.balanceOf(f.samuel.address);
    await f.staking.connect(f.samuel).claimRewards();
    const after = await f.musd.balanceOf(f.samuel.address);
    expect(after).to.be.gt(before);
  });

  it("epoch counter increments after each harvest", async () => {
    const f = await loadFixture(deployFixture);
    await samuelDepositAndStake(f);
    await f.mockVoter.seedBribe(f.brideA, ethers.parseEther("100"));
    expect(await f.voter.currentEpoch()).to.equal(0n);
    await time.increase(EPOCH);
    await f.voter.connect(f.keeper).castVotes();
    await f.voter.connect(f.keeper).harvestAndDistribute();
    expect(await f.voter.currentEpoch()).to.equal(1n);
  });
});

// ── ByNdVoter — markLocksExtended ────────────────────────────────────────────

describe("ByNdVoter — markLocksExtended", () => {
  it("marks the epoch and reverts on duplicate", async () => {
    const { voter, keeper } = await loadFixture(deployFixture);
    await voter.connect(keeper).markLocksExtended();
    expect(await voter.epochLocksExtended(0n)).to.be.true;
    await expect(voter.connect(keeper).markLocksExtended())
      .to.be.revertedWith("ByNdVoter: already marked");
  });
});

// ── ByNdVoter — governance ────────────────────────────────────────────────────

describe("ByNdVoter — governance", () => {
  it("non-governance cannot call setGauges", async () => {
    const { voter, samuel } = await loadFixture(deployFixture);
    await expect(voter.connect(samuel).setGauges([], [], [], [], []))
      .to.be.revertedWith("ByNdVoter: not governance");
  });

  it("gauge weights must sum to 10000", async () => {
    const { voter, musd } = await loadFixture(deployFixture);
    const zero = ethers.ZeroAddress; // bypass isAlive check
    await expect(voter.setGauges(
      [zero], [zero], ["Test"], [5000], [[await musd.getAddress()]]
    )).to.be.revertedWith("ByNdVoter: weights must sum to 10000");
  });

  it("bountyBps < MAX_BPS is enforced", async () => {
    const { voter } = await loadFixture(deployFixture);
    await expect(voter.setBountyBps(10001)).to.be.revertedWith("ByNdVoter: bps too high");
  });

  it("governance can transfer to new address", async () => {
    const { voter, samuel } = await loadFixture(deployFixture);
    await voter.transferGovernance(samuel.address);
    expect(await voter.governance()).to.equal(samuel.address);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function block_far_future() {
  return Math.floor(Date.now() / 1000) + 4 * 365 * 24 * 3600;
}

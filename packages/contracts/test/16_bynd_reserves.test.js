const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BYNDTreasuryReserve + BYNDEcosystemReserve", function () {
  let admin, timelock, alice, bob;
  let bynd, treasury, ecosystem;
  const CAP = ethers.parseEther("100000000");

  beforeEach(async function () {
    [admin, timelock, alice, bob] = await ethers.getSigners();

    const BYND = await ethers.getContractFactory("BYND");
    bynd = await BYND.deploy(admin.address, CAP);
    await bynd.waitForDeployment();

    const Treasury = await ethers.getContractFactory("BYNDTreasuryReserve");
    treasury = await Treasury.deploy(admin.address, await bynd.getAddress());
    await treasury.waitForDeployment();

    const Ecosystem = await ethers.getContractFactory("BYNDEcosystemReserve");
    ecosystem = await Ecosystem.deploy(admin.address, await bynd.getAddress());
    await ecosystem.waitForDeployment();

    await bynd.grantRole(await bynd.MINTER_ROLE(), await treasury.getAddress());
    await bynd.grantRole(await bynd.MINTER_ROLE(), await ecosystem.getAddress());

    await treasury.connect(admin).grantRole(await treasury.TIMELOCK_ROLE(), timelock.address);
    await ecosystem.connect(admin).grantRole(await ecosystem.TIMELOCK_ROLE(), timelock.address);
  });

  describe("BYNDTreasuryReserve", function () {
    it("deploys with the correct 15M cap, nothing released yet", async function () {
      expect(await treasury.TREASURY_CAP()).to.equal(ethers.parseEther("15000000"));
      expect(await treasury.remainingCap()).to.equal(ethers.parseEther("15000000"));
      expect(await treasury.totalReleased()).to.equal(0);
    });

    it("is not automatically circulating — nothing is minted until an explicit release", async function () {
      expect(await bynd.totalSupply()).to.equal(0);
      await treasury.connect(timelock).release(alice.address, ethers.parseEther("100"), "runway top-up");
      expect(await bynd.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
      expect(await bynd.totalSupply()).to.equal(ethers.parseEther("100"));
    });

    it("requires a non-empty reason for every release", async function () {
      await expect(
        treasury.connect(timelock).release(alice.address, ethers.parseEther("100"), ""),
      ).to.be.revertedWith("reason required");
    });

    it("records the reason in the Released event", async function () {
      const tx = await treasury.connect(timelock).release(alice.address, ethers.parseEther("50"), "audit payment");
      await expect(tx).to.emit(treasury, "Released").withArgs(alice.address, ethers.parseEther("50"), "audit payment");
    });

    it("cannot exceed the 15M cap, even across multiple releases", async function () {
      await treasury.connect(timelock).release(alice.address, ethers.parseEther("10000000"), "op costs Q1");
      await treasury.connect(timelock).release(bob.address, ethers.parseEther("5000000"), "op costs Q2");
      expect(await treasury.remainingCap()).to.equal(0);

      await expect(
        treasury.connect(timelock).release(alice.address, 1, "one more"),
      ).to.be.revertedWith("exceeds reserve cap");
    });

    it("only TIMELOCK_ROLE can release — not an arbitrary EOA, not ADMIN_ROLE alone", async function () {
      await expect(
        treasury.connect(alice).release(alice.address, ethers.parseEther("1"), "self-serve"),
      ).to.be.reverted;
      await expect(
        treasury.connect(admin).release(alice.address, ethers.parseEther("1"), "admin trying"),
      ).to.be.reverted;
    });

    it("rejects a zero recipient or zero amount", async function () {
      await expect(
        treasury.connect(timelock).release(ethers.ZeroAddress, ethers.parseEther("1"), "bad recipient"),
      ).to.be.revertedWith("to=0");
      await expect(
        treasury.connect(timelock).release(alice.address, 0, "nothing"),
      ).to.be.revertedWith("amount=0");
    });
  });

  describe("BYNDEcosystemReserve", function () {
    it("deploys with the correct 20M cap", async function () {
      expect(await ecosystem.ECOSYSTEM_CAP()).to.equal(ethers.parseEther("20000000"));
      expect(await ecosystem.remainingCap()).to.equal(ethers.parseEther("20000000"));
    });

    it("cannot exceed the 20M cap", async function () {
      await ecosystem.connect(timelock).release(alice.address, ethers.parseEther("20000000"), "grants program");
      await expect(
        ecosystem.connect(timelock).release(bob.address, 1, "one more grant"),
      ).to.be.revertedWith("exceeds reserve cap");
    });
  });

  it("treasury and ecosystem reserves draw against completely independent caps", async function () {
    await treasury.connect(timelock).release(alice.address, ethers.parseEther("15000000"), "fully spent");
    expect(await treasury.remainingCap()).to.equal(0);
    expect(await ecosystem.remainingCap()).to.equal(ethers.parseEther("20000000"));
  });
});

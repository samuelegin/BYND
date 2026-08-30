// check-voter-impl-slot.js
// Reads the EIP-1967 implementation address directly from proxy storage.
// This bypasses the OpenZeppelin manifest and the script's own "Upgraded."
// print statement entirely -- it is ground truth from the chain itself.
//
// Run from packages/contracts (same folder as hardhat.config.js):
//   npx hardhat run scripts/check-voter-impl-slot.js --network mezotestnet

const { ethers } = require("hardhat");

async function main() {
  const proxies = {
    ByNdVault: "0xb7B1CD5c9D6d3deDE64F3c803826f6B6150a2B6C",
    ByNdVoter: "0x76b7e2EbD2839c36802442931382032e8840218d",
  };

  // keccak256("eip1967.proxy.implementation") - 1
  const IMPL_SLOT =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bb";

  // keccak256("eip1967.proxy.beacon") - 1
  const BEACON_SLOT =
    "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d5";

  for (const [name, proxy] of Object.entries(proxies)) {
    const code = await ethers.provider.send("eth_getCode", [proxy, "latest"]);
    console.log(`${name} (${proxy})`);
    console.log(`  bytecode present: ${code !== "0x"} (length: ${code.length})`);

    const raw = await ethers.provider.send("eth_getStorageAt", [
      proxy,
      IMPL_SLOT,
      "latest",
    ]);
    const impl = "0x" + raw.slice(-40);
    console.log(`  EIP-1967 impl slot:   ${impl}`);

    const rawBeacon = await ethers.provider.send("eth_getStorageAt", [
      proxy,
      BEACON_SLOT,
      "latest",
    ]);
    const beacon = "0x" + rawBeacon.slice(-40);
    console.log(`  EIP-1967 beacon slot: ${beacon}`);

    // If a beacon address was found, ask it what the real implementation is.
    if (beacon !== "0x0000000000000000000000000000000000000000") {
      const beaconAbi = ["function implementation() view returns (address)"];
      const beaconContract = new ethers.Contract(beacon, beaconAbi, ethers.provider);
      try {
        const realImpl = await beaconContract.implementation();
        console.log(`  -> beacon reports implementation: ${realImpl}`);
      } catch (e) {
        console.log(`  -> beacon.implementation() call failed: ${e.message}`);
      }
    }

    const net = await ethers.provider.getNetwork();
    console.log(`  connected chainId: ${net.chainId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

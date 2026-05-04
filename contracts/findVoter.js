const { ethers } = require("hardhat");

async function main() {
  console.log("--- Matsnet Discovery (Read-Only Mode) ---");

  const targetAddresses = [
    "0x9C070027cdC9dc8F82416B2e5314E11DFb4FE3CD", // Address from your image
    "0xAB13B8eecf5AA2460841d75da5d5D861fD5B8A39", 
    "0x2dFdEb833c199ba5D166C90A3B25B0E72288076B"
  ];

  for (const addr of targetAddresses) {
    // This checks the blockchain directly without needing a wallet/private key
    const code = await ethers.provider.getCode(addr);
    
    if (code === "0x" || code === "0x0") {
      console.log(`❌ ${addr}: EMPTY`);
    } else {
      console.log(`✅ ${addr}: ACTIVE CONTRACT FOUND`);
      // Add this inside your 'else' block in findVoter.js
try {
  const contract = new ethers.Contract(addr, ["function totalWeight() view returns (uint256)"], ethers.provider);
  const weight = await contract.totalWeight();
  console.log(`   🎯 This looks like a Voter! Total Weight: ${weight}`);
} catch (e) {
  console.log(`   ⚠️ Active, but likely NOT the Voter contract.`);
}

    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

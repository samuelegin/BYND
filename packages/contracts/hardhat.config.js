require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const MATSNET_RPC_URL = process.env.MATSNET_RPC_URL || "https://rpc.test.mezo.org";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      // Lowered from 200 -> 20. ByNdVoter.sol is currently 260 bytes over
      // the EIP-170 24576-byte deployment size limit (confirmed by the
      // compiler warning, and NOT caught by `npx hardhat test` since the
      // local hardhat network has allowUnlimitedContractSize: true below —
      // mezotestnet and any real mainnet config have no such override, so
      // this would genuinely fail to deploy there as-is).
      //
      // `runs` trades deployment size against per-call runtime gas: a LOW
      // value (like 20) optimizes for a small deployed contract at the cost
      // of slightly higher gas per transaction; a HIGH value (like the
      // previous 200) does the opposite. Since we're over the hard
      // deployment-size limit, size has to win here — a contract that costs
      // a bit more gas per call is fine; a contract that can't deploy at
      // all is not.
      optimizer: { enabled: true, runs: 20 },
      evmVersion: "london",
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    mezotestnet: {
      url: MATSNET_RPC_URL,
      chainId: 31611,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      mezotestnet: "not-needed-for-blockscout",
    },
    customChains: [
      {
        network: "mezotestnet",
        chainId: 31611,
        urls: {
          apiURL: "https://api.explorer.test.mezo.org/api",
          browserURL: "https://explorer.test.mezo.org",
        },
      },
    ],
  },
};
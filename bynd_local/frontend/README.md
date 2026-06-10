# BynD — Deploy & Run

## Local (Hardhat)

**Terminal 1 — start node**
```bash
cd contracts && npm install
npx hardhat node --port 8545
```

**Terminal 2 — deploy + sync addresses**
```bash
npm run deploy:local
```
Deploys contracts and writes `.env.local` automatically.

**Terminal 3 — start app**
```bash
npm run dev
```
Open http://localhost:3000. Toggle **Local** in the Terminal header.

**MetaMask (one-time)**
- RPC: `http://127.0.0.1:8545` · Chain ID: `31337` · Currency: `ETH`
- Import any test account from Hardhat node output

**Skip epoch (7-day cooldown)**
```bash
cd contracts
npx hardhat console --network localhost
await network.provider.send("evm_increaseTime", [604800])
await network.provider.send("evm_mine", [])
```
Or use the ⏩ Skip Epoch button in the app (Local mode only).

---

## Matsnet

1. Open `contracts/scripts/deploy.ts` — fill in `ValidatorsVoter` address
2. `npm run deploy:matsnet`
3. Paste printed addresses into `src/lib/contracts.ts` → `MATSNET_ADDRESSES`
4. `npm run dev` — toggle **Matsnet** in the header

---

## Test flow

1. Deposit veMEZO NFT → receive veBYND 1:1
2. Stake veBYND → activate MUSD yield
3. Keeper: extendLocks() → castVotes() → harvestAndDistribute()
4. Claim MUSD rewards

---

## Scripts

| Command | What it does |
|---|---|
| `npm run node:local` | Start Hardhat node on :8545 |
| `npm run deploy:local` | Deploy to local + write .env.local |
| `npm run deploy:matsnet` | Deploy to Matsnet |
| `npm run sync-addresses` | Re-sync .env.local from deployed-addresses.json |
| `npm run dev` | Start frontend |
| `npm test` (in /contracts) | Run 28 contract tests |
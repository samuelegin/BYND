#!/usr/bin/env bash
# BynD — Local Development Setup
# Starts a Hardhat node, deploys all contracts, seeds test data,
# prints MetaMask instructions, then starts the Next.js frontend.
#
# Usage (from the repo root):
#   chmod +x scripts/local-setup.sh
#   ./scripts/local-setup.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
ADDRESSES_FILE="$CONTRACTS_DIR/deployed-addresses.json"

GREEN='\033[0;32m'; ACID='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
log() { echo -e "${ACID}▶${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; }
dim() { echo -e "${DIM}  $1${NC}"; }

echo ""
echo -e "${ACID}  BynD Protocol — Local Node Setup${NC}"
echo ""

#1. Install contract deps
log "Installing contract dependencies..."
cd "$CONTRACTS_DIR"
npm install --silent
ok "Contract deps ready"
echo ""

#2. Start Hardhat node in background
log "Starting Hardhat node on http://127.0.0.1:8545 ..."

if lsof -ti:8545 > /dev/null 2>&1; then
  dim "Port 8545 in use — killing existing process..."
  kill "$(lsof -ti:8545)" 2>/dev/null || true
  sleep 1
fi

npx hardhat node --port 8545 > /tmp/bynd-hardhat.log 2>&1 &
HARDHAT_PID=$!
echo "$HARDHAT_PID" > /tmp/bynd-hardhat.pid

echo -n "  Waiting for node"
for i in $(seq 1 30); do
  sleep 0.5
  if curl -s -X POST http://127.0.0.1:8545 \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
     > /dev/null 2>&1; then
    echo " ready"
    break
  fi
  echo -n "."
done
echo ""
ok "Hardhat node running  (chainId 31337, PID $HARDHAT_PID)"
echo ""

#3. Deploy contracts 
log "Deploying BynD contracts..."
echo ""
cd "$CONTRACTS_DIR"
npx hardhat run scripts/deploy.ts --network localhost 2>&1 | tee /tmp/bynd-deploy.log
echo ""

if [ ! -f "$ADDRESSES_FILE" ]; then
  err "deployed-addresses.json not found — check /tmp/bynd-deploy.log"
  exit 1
fi
ok "Contracts deployed — addresses saved to contracts/deployed-addresses.json"
echo ""

#4. Print addresses
echo -e "${ACID}Deployed Addresses${NC}"
node -e "
  const d = require('$ADDRESSES_FILE');
  console.log('  VeBYND      :', d.contracts.VeBYND);
  console.log('  ByNdVault   :', d.contracts.ByNdVault);
  console.log('  ByNdStaking :', d.contracts.ByNdStaking);
  console.log('  ByNdVoter   :', d.contracts.ByNdVoter);
  console.log('  MockVeMEZO  :', d.native.VeMEZO);
  console.log('  MockMUSD    :', d.native.MUSD);
"
echo ""

#5. Install frontend deps
log "Installing frontend dependencies..."
cd "$ROOT_DIR"
npm install --silent
ok "Frontend deps ready"
echo ""

#6. MetaMask instructions 
echo -e "${ACID}  MetaMask Setup (one-time)${NC}"
echo ""
echo "  Add network in MetaMask → Settings → Networks → Add Network:"
echo ""
echo "     Network name  :  Hardhat Localhost"
echo "     RPC URL       :  http://127.0.0.1:8545"
echo "     Chain ID      :  31337"
echo "     Currency      :  ETH"
echo ""
echo "  Import a test wallet (any of these have 10 000 ETH):"
echo ""
echo "  #0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "      PK: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""
echo "  #1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo "      PK: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo ""
echo "  #2  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
echo "      PK: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
echo ""
echo ""
echo "  In the app:  toggle 'Local' in the Terminal header, then Connect Wallet"
echo ""
echo ""
dim "Hardhat logs : /tmp/bynd-hardhat.log"
dim "Deploy log   : /tmp/bynd-deploy.log"
dim "Stop node    : kill \$(cat /tmp/bynd-hardhat.pid)"
echo ""

#7. Start frontend
log "Starting Next.js frontend on http://localhost:3000 ..."
echo ""
cd "$ROOT_DIR"
npm run dev
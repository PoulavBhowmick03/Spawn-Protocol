#!/usr/bin/env bash
set -e

PRIVATE_KEY=$(grep "^PRIVATE_KEY" ../.env | cut -d= -f2)
RPC="https://api.calibration.node.glif.io/rpc/v1"
FLAGS="--rpc-url $RPC --private-key $PRIVATE_KEY --gas-limit 100000000 --legacy --broadcast"

echo "Deploying to Filecoin Calibration Testnet (chain 314159)..."
echo ""

cd ../contracts

deploy() {
  local label=$1
  local contract=$2
  local args=$3
  echo "Deploying $label..."
  local out
  out=$(FOUNDRY_PROFILE=filecoin forge create $contract $FLAGS $args 2>&1)
  local addr
  addr=$(echo "$out" | grep "Deployed to:" | awk '{print $3}')
  if [ -z "$addr" ]; then
    echo "  ERROR: $out" | tail -5
    exit 1
  fi
  echo "  $label: $addr"
  echo "$addr"
}

UNISWAP=$(deploy "MockGovernor (Uniswap)" "src/MockGovernor.sol:MockGovernor" "--constructor-args 300")
echo ""
LIDO=$(deploy "MockGovernor (Lido)" "src/MockGovernor.sol:MockGovernor" "--constructor-args 300")
echo ""
ENS=$(deploy "MockGovernor (ENS)" "src/MockGovernor.sol:MockGovernor" "--constructor-args 300")
echo ""
TREASURY=$(deploy "ParentTreasury" "src/ParentTreasury.sol:ParentTreasury" "--constructor-args 30 1000000000000000000")
echo ""
CHILD_IMPL=$(deploy "ChildGovernor (impl)" "src/ChildGovernor.sol:ChildGovernor" "")
echo ""
FACTORY=$(deploy "SpawnFactory" "src/SpawnFactory.sol:SpawnFactory" "--constructor-args $TREASURY $CHILD_IMPL")
echo ""
TIMELOCK=$(deploy "TimeLock" "src/TimeLock.sol:TimeLock" "")

echo ""
echo "=== Filecoin Calibration Deployment Complete ==="
echo "MockGovernor (Uniswap): $UNISWAP"
echo "MockGovernor (Lido):    $LIDO"
echo "MockGovernor (ENS):     $ENS"
echo "ParentTreasury:         $TREASURY"
echo "ChildGovernor (impl):   $CHILD_IMPL"
echo "SpawnFactory:           $FACTORY"
echo "TimeLock:               $TIMELOCK"
echo ""
echo "Explorer: https://calibration.filfox.info/en/address/<addr>"

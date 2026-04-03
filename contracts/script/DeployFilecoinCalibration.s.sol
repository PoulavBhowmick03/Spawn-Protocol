// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/MockGovernor.sol";
import "../src/SpawnFactory.sol";
import "../src/ChildGovernor.sol";
import "../src/ParentTreasury.sol";
import "../src/TimeLock.sol";

/// @title DeployFilecoinCalibration
/// @notice Deploys Spawn Protocol governance contracts to Filecoin Calibration Testnet (chain 314159).
///         This satisfies the PL Genesis Filecoin bounty requirement to deploy to Calibration Testnet.
///         The Filecoin EVM is fully EVM-compatible so all contracts deploy without modification.
///
/// Usage:
///   forge script contracts/script/DeployFilecoinCalibration.s.sol \
///     --rpc-url https://api.calibration.node.glif.io/rpc/v1 \
///     --broadcast \
///     --private-key $PRIVATE_KEY
contract DeployFilecoinCalibration is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 3 governance contracts — same DAOs as Base Sepolia for cross-chain demo
        MockGovernor uniswapGov = new MockGovernor(300); // 5 min voting period
        MockGovernor lidoGov    = new MockGovernor(300);
        MockGovernor ensGov     = new MockGovernor(300);

        // Core infrastructure
        ParentTreasury treasury  = new ParentTreasury(30, 1 ether);
        ChildGovernor  childImpl = new ChildGovernor();
        SpawnFactory   factory   = new SpawnFactory(address(treasury), address(childImpl));
        TimeLock       timeLock  = new TimeLock();

        // Wire up
        treasury.setSpawnFactory(address(factory));
        treasury.setGovernanceValues(
            "Prioritize decentralization, oppose token inflation, support public goods funding, favor progressive decentralization"
        );

        vm.stopBroadcast();

        console.log("=== Filecoin Calibration Testnet Deployment (chain 314159) ===");
        console.log("Uniswap Governor:      ", address(uniswapGov));
        console.log("Lido Governor:         ", address(lidoGov));
        console.log("ENS Governor:          ", address(ensGov));
        console.log("ParentTreasury:        ", address(treasury));
        console.log("ChildGovernor (impl):  ", address(childImpl));
        console.log("SpawnFactory:          ", address(factory));
        console.log("TimeLock:              ", address(timeLock));
        console.log("");
        console.log("Explorer: https://calibration.filfox.info/en/address/<address>");
        console.log("Filecoin storage (Synapse SDK) is wired to this same chain.");
    }
}

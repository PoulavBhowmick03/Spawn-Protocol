// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SpawnENSRegistry.sol";

contract SpawnENSRegistryTest is Test {
    SpawnENSRegistry registry;
    address deployer = address(this);
    address child1 = address(0x1111);
    address child2 = address(0x2222);
    address child3 = address(0x3333);

    function setUp() public {
        registry = new SpawnENSRegistry();
    }

    function testOwnerIsDeployer() public view {
        assertEq(registry.owner(), deployer);
    }

    function testParentDomain() public view {
        assertEq(registry.parentDomain(), "spawn.eth");
    }

    // ── Register ──

    function testRegisterSubdomain() public {
        bytes32 node = registry.registerSubdomain("uniswap-dao", child1);
        assertEq(registry.resolve("uniswap-dao"), child1);
        assertEq(node, registry.computeNode("uniswap-dao"));
    }

    function testRegisterEmitsEvent() public {
        bytes32 node = registry.computeNode("lido-dao");
        vm.expectEmit(true, true, false, true);
        emit SpawnENSRegistry.NameRegistered(node, "lido-dao.spawn.eth", child2);
        registry.registerSubdomain("lido-dao", child2);
    }

    function testCannotRegisterDuplicate() public {
        registry.registerSubdomain("uniswap-dao", child1);
        vm.expectRevert("already registered");
        registry.registerSubdomain("uniswap-dao", child2);
    }

    function testCannotRegisterZeroAddress() public {
        vm.expectRevert("zero address");
        registry.registerSubdomain("zero", address(0));
    }

    function testOnlyOwnerCanRegister() public {
        vm.prank(child1);
        vm.expectRevert("only owner");
        registry.registerSubdomain("test", child2);
    }

    // ── Deregister ──

    function testDeregisterSubdomain() public {
        registry.registerSubdomain("uniswap-dao", child1);
        registry.deregisterSubdomain("uniswap-dao");
        assertEq(registry.resolve("uniswap-dao"), address(0));
    }

    function testDeregisterEmitsEvent() public {
        registry.registerSubdomain("lido-dao", child2);
        bytes32 node = registry.computeNode("lido-dao");
        vm.expectEmit(true, false, false, true);
        emit SpawnENSRegistry.NameDeregistered(node, "lido-dao.spawn.eth");
        registry.deregisterSubdomain("lido-dao");
    }

    function testDeregisterClearsReverseRecord() public {
        registry.registerSubdomain("uniswap-dao", child1);
        registry.deregisterSubdomain("uniswap-dao");
        string memory name = registry.reverseResolve(child1);
        assertEq(bytes(name).length, 0);
    }

    function testCannotDeregisterNotRegistered() public {
        vm.expectRevert("not registered");
        registry.deregisterSubdomain("nonexistent");
    }

    // ── Resolve ──

    function testResolveUnregistered() public view {
        assertEq(registry.resolve("nobody"), address(0));
    }

    // ── Reverse Resolve ──

    function testReverseResolve() public {
        registry.registerSubdomain("uniswap-dao", child1);
        string memory name = registry.reverseResolve(child1);
        assertEq(name, "uniswap-dao.spawn.eth");
    }

    function testReverseResolveUnregistered() public view {
        string memory name = registry.reverseResolve(child1);
        assertEq(bytes(name).length, 0);
    }

    // ── Text Records ──

    function testSetTextRecord() public {
        registry.registerSubdomain("uniswap-dao", child1);
        registry.setTextRecord("uniswap-dao", "agentType", "child");
        assertEq(registry.getTextRecord("uniswap-dao", "agentType"), "child");
    }

    function testSetMultipleTextRecords() public {
        registry.registerSubdomain("lido-dao", child2);
        registry.setTextRecord("lido-dao", "agentType", "child");
        registry.setTextRecord("lido-dao", "governanceContract", "0xABCD");
        registry.setTextRecord("lido-dao", "alignmentScore", "85");

        assertEq(registry.getTextRecord("lido-dao", "agentType"), "child");
        assertEq(registry.getTextRecord("lido-dao", "governanceContract"), "0xABCD");
        assertEq(registry.getTextRecord("lido-dao", "alignmentScore"), "85");
    }

    function testTextRecordEmitsEvent() public {
        registry.registerSubdomain("uniswap-dao", child1);
        bytes32 node = registry.computeNode("uniswap-dao");
        vm.expectEmit(true, false, false, true);
        emit SpawnENSRegistry.TextRecordSet(node, "agentType", "child");
        registry.setTextRecord("uniswap-dao", "agentType", "child");
    }

    function testCannotSetTextRecordOnUnregistered() public {
        vm.expectRevert("not registered");
        registry.setTextRecord("nobody", "key", "value");
    }

    // ── Update Address ──

    function testUpdateAddress() public {
        registry.registerSubdomain("uniswap-dao", child1);
        registry.updateAddress("uniswap-dao", child2);
        assertEq(registry.resolve("uniswap-dao"), child2);
        // Reverse should point to new address
        assertEq(keccak256(bytes(registry.reverseResolve(child2))), keccak256(bytes("uniswap-dao.spawn.eth")));
        // Old address should not reverse resolve
        assertEq(bytes(registry.reverseResolve(child1)).length, 0);
    }

    function testUpdateAddressEmitsEvent() public {
        registry.registerSubdomain("uniswap-dao", child1);
        bytes32 node = registry.computeNode("uniswap-dao");
        vm.expectEmit(true, false, false, true);
        emit SpawnENSRegistry.AddressChanged(node, child2);
        registry.updateAddress("uniswap-dao", child2);
    }

    // ── Get All Subdomains ──

    function testGetAllSubdomains() public {
        registry.registerSubdomain("uniswap-dao", child1);
        registry.registerSubdomain("lido-dao", child2);
        registry.registerSubdomain("ens-dao", child3);

        (string[] memory names, address[] memory addresses) = registry.getAllSubdomains();
        assertEq(names.length, 3);
        assertEq(addresses.length, 3);
        assertEq(addresses[0], child1);
        assertEq(addresses[1], child2);
        assertEq(addresses[2], child3);
    }

    function testGetAllSubdomainsAfterDeregister() public {
        registry.registerSubdomain("uniswap-dao", child1);
        registry.registerSubdomain("lido-dao", child2);
        registry.registerSubdomain("ens-dao", child3);

        registry.deregisterSubdomain("lido-dao");

        (string[] memory names, address[] memory addresses) = registry.getAllSubdomains();
        assertEq(names.length, 2);
        // After swap-and-pop, order may change
        assertEq(addresses.length, 2);
    }

    // ── Subdomain Count ──

    function testSubdomainCount() public {
        assertEq(registry.subdomainCount(), 0);
        registry.registerSubdomain("uniswap-dao", child1);
        assertEq(registry.subdomainCount(), 1);
        registry.registerSubdomain("lido-dao", child2);
        assertEq(registry.subdomainCount(), 2);
        registry.deregisterSubdomain("uniswap-dao");
        assertEq(registry.subdomainCount(), 1);
    }

    // ── Get Record ──

    function testGetRecord() public {
        registry.registerSubdomain("uniswap-dao", child1);
        (address recordOwner, address resolvedAddress, string memory name, uint256 registeredAt) = registry.getRecord("uniswap-dao");
        assertEq(recordOwner, deployer);
        assertEq(resolvedAddress, child1);
        assertEq(name, "uniswap-dao.spawn.eth");
        assertGt(registeredAt, 0);
    }

    // ── Transfer Ownership ──

    function testTransferOwnership() public {
        registry.transferOwnership(child1);
        assertEq(registry.owner(), child1);

        // Old owner can no longer register
        vm.expectRevert("only owner");
        registry.registerSubdomain("test", child2);

        // New owner can register
        vm.prank(child1);
        registry.registerSubdomain("test", child2);
        assertEq(registry.resolve("test"), child2);
    }

    // ── computeNode is a keccak but calldata-based ──

    function testComputeNodeIsDeterministic() public view {
        bytes32 a = registry.computeNode("uniswap-dao");
        bytes32 b = registry.computeNode("uniswap-dao");
        assertEq(a, b);
    }

    function testComputeNodeDiffersForDifferentLabels() public view {
        bytes32 a = registry.computeNode("uniswap-dao");
        bytes32 b = registry.computeNode("lido-dao");
        assertTrue(a != b);
    }
}

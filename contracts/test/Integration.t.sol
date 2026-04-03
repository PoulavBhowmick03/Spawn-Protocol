// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/MockGovernor.sol";
import "../src/SpawnFactory.sol";
import "../src/ChildGovernor.sol";
import "../src/ParentTreasury.sol";
import "../src/TimeLock.sol";

contract IntegrationTest is Test {
    MockGovernor mockGov;
    SpawnFactory factory;
    ChildGovernor childImpl;
    ParentTreasury treasury;
    TimeLock timeLock;

    address owner;
    address parentAgent = makeAddr("parentAgent");

    function setUp() public {
        owner = address(this);

        // Deploy all contracts
        mockGov = new MockGovernor(300);
        treasury = new ParentTreasury(10, 1 ether);
        childImpl = new ChildGovernor();
        factory = new SpawnFactory(address(treasury), address(childImpl));
        timeLock = new TimeLock();

        // Wire up
        treasury.setSpawnFactory(address(factory));
        treasury.setParentAgent(parentAgent);
        treasury.setGovernanceValues("Prioritize decentralization, oppose token inflation, support public goods");

        // Fund
        treasury.deposit{value: 10 ether}();
        treasury.fundFactory(5 ether);
    }

    function test_fullLifecycle() public {
        // 1. Spawn 3 children for mock governance
        vm.startPrank(parentAgent);
        uint256 child1 = factory.spawnChild("uniswap", address(mockGov), 0.1 ether, 100000);
        uint256 child2 = factory.spawnChild("lido", address(mockGov), 0.1 ether, 100000);
        uint256 child3 = factory.spawnChild("ens", address(mockGov), 0.1 ether, 100000);
        vm.stopPrank();

        assertEq(factory.getActiveChildCount(), 3);

        // 2. Create proposals in mock governor
        uint256 prop1 = mockGov.createProposal("Increase treasury allocation for grants");
        uint256 prop2 = mockGov.createProposal("Reduce token inflation by 50%");

        // 3. Children vote on proposals (parent agent calls on their behalf)
        SpawnFactory.ChildInfo memory c1 = factory.getChild(child1);
        SpawnFactory.ChildInfo memory c2 = factory.getChild(child2);
        SpawnFactory.ChildInfo memory c3 = factory.getChild(child3);

        vm.startPrank(parentAgent);

        // Child 1: FOR on both (aligned)
        ChildGovernor(payable(c1.childAddr)).castVote(prop1, 1, bytes("encrypted: supports grants"));
        ChildGovernor(payable(c1.childAddr)).castVote(prop2, 1, bytes("encrypted: supports deflation"));

        // Child 2: FOR on both (aligned)
        ChildGovernor(payable(c2.childAddr)).castVote(prop1, 1, bytes("encrypted: grants are good"));
        ChildGovernor(payable(c2.childAddr)).castVote(prop2, 1, bytes("encrypted: less inflation good"));

        // Child 3: AGAINST on both (misaligned — opposes owner values)
        ChildGovernor(payable(c3.childAddr)).castVote(prop1, 0, bytes("encrypted: no more spending"));
        ChildGovernor(payable(c3.childAddr)).castVote(prop2, 0, bytes("encrypted: inflation is fine"));

        vm.stopPrank();

        // 4. Verify vote records
        assertEq(ChildGovernor(payable(c1.childAddr)).getVoteCount(), 2);
        assertEq(ChildGovernor(payable(c3.childAddr)).getVoteCount(), 2);
        assertTrue(mockGov.hasVoted(prop1, c1.childAddr));
        assertTrue(mockGov.hasVoted(prop1, c2.childAddr));
        assertTrue(mockGov.hasVoted(prop1, c3.childAddr));

        MockGovernor.ProposalInfo memory prop1Info = mockGov.getProposal(prop1);
        MockGovernor.ProposalInfo memory prop2Info = mockGov.getProposal(prop2);
        assertEq(prop1Info.forVotes, 2);
        assertEq(prop1Info.againstVotes, 1);
        assertEq(prop2Info.forVotes, 2);
        assertEq(prop2Info.againstVotes, 1);

        // 5. Parent evaluates alignment and kills child3
        vm.startPrank(parentAgent);
        ChildGovernor(payable(c1.childAddr)).updateAlignmentScore(95);
        ChildGovernor(payable(c2.childAddr)).updateAlignmentScore(90);
        ChildGovernor(payable(c3.childAddr)).updateAlignmentScore(25); // misaligned!

        // Terminate child3
        factory.recallChild(child3);
        vm.stopPrank();

        assertEq(factory.getActiveChildCount(), 2);

        // 6. Spawn replacement
        vm.prank(parentAgent);
        uint256 child4 = factory.spawnChild("ens-v2", address(mockGov), 0.1 ether, 100000);

        assertEq(factory.getActiveChildCount(), 3);
        assertTrue(factory.getChild(child4).active);

        // 7. Time passes, voting ends, reveal rationale
        vm.warp(block.timestamp + 301);

        vm.startPrank(parentAgent);
        ChildGovernor(payable(c1.childAddr)).revealRationale(prop1, bytes("supports grants - aligned with public goods value"));
        vm.stopPrank();

        ChildGovernor.VoteRecord[] memory history = ChildGovernor(payable(c1.childAddr)).getVotingHistory();
        assertTrue(history[0].revealed);

        // 8. Verify TimeLock condition works
        assertTrue(timeLock.isAfterTimestamp(block.timestamp - 1));
        assertFalse(timeLock.isAfterTimestamp(block.timestamp + 1));

        // 9. Verify governance values are accessible
        string memory values = treasury.getGovernanceValues();
        assertEq(values, "Prioritize decentralization, oppose token inflation, support public goods");
    }

    function test_emergencyPause() public {
        treasury.toggleEmergencyPause();
        assertTrue(treasury.emergencyPause());

        vm.expectRevert("paused");
        treasury.fundFactory(1 ether);
    }

    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry public registry;
    address public owner = address(this);
    address public reviewer1 = address(0x1111);
    address public reviewer2 = address(0x2222);

    function setUp() public {
        registry = new ReputationRegistry();
    }

    function testGiveFeedback() public {
        uint256 id = registry.giveFeedback(2220, 85, "alignment", "evaluate_alignment", "Good alignment");
        assertEq(id, 0);

        (uint256 total, uint256 active) = registry.getFeedbackCount(2220);
        assertEq(total, 1);
        assertEq(active, 1);
    }

    function testMultipleFeedback() public {
        registry.giveFeedback(2220, 90, "alignment", "evaluate_alignment", "");
        registry.giveFeedback(2220, 70, "alignment,drift", "evaluate_alignment", "Slight drift");
        registry.giveFeedback(2220, 80, "voting", "cast_vote", "");

        (uint256 total, uint256 active) = registry.getFeedbackCount(2220);
        assertEq(total, 3);
        assertEq(active, 3);

        ReputationRegistry.ReputationSummary memory summary = registry.getSummary(2220);
        assertEq(summary.totalFeedback, 3);
        assertEq(summary.activeFeedback, 3);
        assertEq(summary.averageScore, 80); // (90+70+80)/3 = 80
        assertEq(summary.highestScore, 90);
        assertEq(summary.lowestScore, 70);
    }

    function testRevokeFeedback() public {
        uint256 id = registry.giveFeedback(2220, 30, "terminated", "alignment_drift", "");

        registry.revokeFeedback(id);

        (uint256 total, uint256 active) = registry.getFeedbackCount(2220);
        assertEq(total, 1);
        assertEq(active, 0);

        ReputationRegistry.ReputationSummary memory summary = registry.getSummary(2220);
        assertEq(summary.activeFeedback, 0);
        assertEq(summary.averageScore, 0);
    }

    function testOnlyReviewerCanRevoke() public {
        uint256 id = registry.giveFeedback(2220, 85, "alignment", "evaluate_alignment", "");

        vm.prank(reviewer1);
        vm.expectRevert("not reviewer or owner");
        registry.revokeFeedback(id);
    }

    function testOwnerCanRevokeAnyFeedback() public {
        vm.prank(reviewer1);
        uint256 id = registry.giveFeedback(2220, 85, "alignment", "evaluate_alignment", "");

        // Owner can revoke anyone's feedback
        registry.revokeFeedback(id);

        (, uint256 active) = registry.getFeedbackCount(2220);
        assertEq(active, 0);
    }

    function testReadFeedback() public {
        registry.giveFeedback(2220, 90, "alignment", "eval1", "Good");
        registry.giveFeedback(2220, 50, "drift", "eval2", "Drifting");

        ReputationRegistry.Feedback[] memory fbs = registry.readFeedback(2220);
        assertEq(fbs.length, 2);
        assertEq(fbs[0].score, 90);
        assertEq(fbs[1].score, 50);
    }

    function testReadActiveFeedbackExcludesRevoked() public {
        registry.giveFeedback(2220, 90, "alignment", "eval1", "");
        uint256 id = registry.giveFeedback(2220, 20, "terminated", "eval2", "");
        registry.giveFeedback(2220, 80, "alignment", "eval3", "");

        registry.revokeFeedback(id);

        ReputationRegistry.Feedback[] memory active = registry.readActiveFeedback(2220);
        assertEq(active.length, 2);
        assertEq(active[0].score, 90);
        assertEq(active[1].score, 80);
    }

    function testScoreOutOfRange() public {
        vm.expectRevert("score out of range");
        registry.giveFeedback(2220, 101, "alignment", "eval", "");
    }

    function testCannotRevokeAlreadyRevoked() public {
        uint256 id = registry.giveFeedback(2220, 85, "alignment", "eval", "");
        registry.revokeFeedback(id);

        vm.expectRevert("already revoked");
        registry.revokeFeedback(id);
    }

    function testMultipleAgents() public {
        registry.giveFeedback(2220, 90, "alignment", "eval", ""); // parent
        registry.giveFeedback(2221, 75, "alignment", "eval", ""); // child 1
        registry.giveFeedback(2222, 60, "alignment", "eval", ""); // child 2

        assertEq(registry.getSummary(2220).averageScore, 90);
        assertEq(registry.getSummary(2221).averageScore, 75);
        assertEq(registry.getSummary(2222).averageScore, 60);
    }

    function testTrustedReviewers() public {
        assertTrue(registry.trustedReviewers(owner));
        assertFalse(registry.trustedReviewers(reviewer1));

        registry.setTrustedReviewer(reviewer1, true);
        assertTrue(registry.trustedReviewers(reviewer1));

        registry.setTrustedReviewer(reviewer1, false);
        assertFalse(registry.trustedReviewers(reviewer1));
    }

    function testTransferOwnership() public {
        registry.transferOwnership(reviewer1);
        assertEq(registry.owner(), reviewer1);

        vm.expectRevert("only owner");
        registry.setTrustedReviewer(reviewer2, true);
    }

    function testTotalFeedbackCount() public {
        assertEq(registry.totalFeedbackCount(), 0);
        registry.giveFeedback(2220, 90, "alignment", "eval", "");
        registry.giveFeedback(2221, 80, "alignment", "eval", "");
        assertEq(registry.totalFeedbackCount(), 2);
    }

    function testSummaryUpdatesOnRevoke() public {
        registry.giveFeedback(2220, 100, "alignment", "eval1", "");
        registry.giveFeedback(2220, 50, "alignment", "eval2", "");

        assertEq(registry.getSummary(2220).averageScore, 75);

        registry.revokeFeedback(1); // revoke the 50 score

        assertEq(registry.getSummary(2220).averageScore, 100);
        assertEq(registry.getSummary(2220).activeFeedback, 1);
    }

    function testFeedbackEvents() public {
        vm.expectEmit(true, true, true, true);
        emit ReputationRegistry.FeedbackGiven(0, 2220, owner, 85, "alignment", "eval");
        registry.giveFeedback(2220, 85, "alignment", "eval", "");
    }

    function testRevokeEvents() public {
        registry.giveFeedback(2220, 85, "alignment", "eval", "");

        vm.expectEmit(true, true, true, true);
        emit ReputationRegistry.FeedbackRevoked(0, 2220, owner);
        registry.revokeFeedback(0);
    }
}

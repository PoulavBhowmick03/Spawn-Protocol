// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/StETHTreasury.sol";

contract StETHTreasuryTest is Test {
    StETHTreasury treasury;
    address owner;
    address agent = makeAddr("agent");

    function setUp() public {
        owner = address(this);
        treasury = new StETHTreasury(address(0), 0.01 ether); // simulated mode
        treasury.setAgentOperator(agent);
        treasury.deposit{value: 1 ether}();
    }

    function test_principalLocked() public view {
        assertEq(treasury.principalDeposited(), 1 ether);
        assertEq(treasury.isSimulated(), true);
    }

    function test_yieldAccrues() public {
        // Warp 1 year forward — should have ~3.5% yield
        vm.warp(block.timestamp + 365 days);
        uint256 yield_ = treasury.availableYield();
        // 3.5% of 1 ETH = 0.035 ETH, but capped at contract balance
        // Contract has 1 ETH, simulated yield = 0.035 ETH
        assertGt(yield_, 0.034 ether);
        assertLt(yield_, 0.036 ether);
    }

    function test_agentCanWithdrawYield() public {
        vm.warp(block.timestamp + 365 days);

        uint256 agentBalBefore = agent.balance;

        vm.prank(agent);
        treasury.withdrawYield(0.01 ether);

        assertEq(agent.balance - agentBalBefore, 0.01 ether);
        assertEq(treasury.yieldWithdrawn(), 0.01 ether);
    }

    function test_agentCannotWithdrawPrincipal() public {
        // Even after yield accrues, agent can't take more than yield
        vm.warp(block.timestamp + 365 days);

        vm.prank(agent);
        vm.expectRevert("exceeds max per withdrawal");
        treasury.withdrawYield(0.5 ether); // way more than max per withdrawal
    }

    function test_maxYieldPerWithdrawal() public {
        vm.warp(block.timestamp + 365 days);

        vm.prank(agent);
        vm.expectRevert("exceeds max per withdrawal");
        treasury.withdrawYield(0.02 ether); // max is 0.01
    }

    function test_onlyAgentCanWithdraw() public {
        vm.warp(block.timestamp + 365 days);

        vm.expectRevert("only agent");
        treasury.withdrawYield(0.001 ether);
    }

    function test_pauseStopsWithdrawals() public {
        vm.warp(block.timestamp + 365 days);

        treasury.togglePause();

        vm.prank(agent);
        vm.expectRevert("paused");
        treasury.withdrawYield(0.001 ether);
    }

    function test_emergencyWithdraw() public {
        treasury.togglePause();

        uint256 balBefore = address(this).balance;
        treasury.emergencyWithdraw();
        assertEq(address(this).balance - balBefore, 1 ether);
        assertEq(treasury.principalDeposited(), 0);
    }

    function test_configurablePermission() public {
        // Owner can adjust max yield per withdrawal
        treasury.setMaxYieldPerWithdrawal(0.005 ether);
        assertEq(treasury.maxYieldPerWithdrawal(), 0.005 ether);

        vm.warp(block.timestamp + 365 days);

        vm.prank(agent);
        vm.expectRevert("exceeds max per withdrawal");
        treasury.withdrawYield(0.006 ether);

        vm.prank(agent);
        treasury.withdrawYield(0.005 ether); // this should work
    }

    function test_getStatus() public {
        vm.warp(block.timestamp + 365 days);
        (uint256 principal, uint256 balance, uint256 yield_, uint256 withdrawn, bool simulated) = treasury.getStatus();
        assertEq(principal, 1 ether);
        assertEq(balance, 1 ether);
        assertGt(yield_, 0);
        assertEq(withdrawn, 0);
        assertTrue(simulated);
    }

    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/ValidationRegistry.sol";

contract ValidationRegistryTest is Test {
    ValidationRegistry public registry;
    address public owner = address(this);
    address public validator1 = address(0x1111);
    address public validator2 = address(0x2222);
    address public agent1 = address(0x3333);

    bytes32 constant CONTENT_HASH = keccak256("vote rationale for proposal #42");

    function setUp() public {
        registry = new ValidationRegistry();
    }

    function testCreateValidationRequest() public {
        uint256 id = registry.validationRequest(
            2220, validator1, "ipfs://QmTest123", CONTENT_HASH, "vote"
        );
        assertEq(id, 0);

        ValidationRegistry.ValidationRequest memory req = registry.getValidationStatus(0);
        assertEq(req.agentId, 2220);
        assertEq(req.validator, validator1);
        assertEq(req.contentHash, CONTENT_HASH);
        assertTrue(req.status == ValidationRegistry.ValidationStatus.Pending);
    }

    function testValidationResponse() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        vm.prank(validator1);
        registry.validationResponse(0, 95, true, "Reasoning checks out");

        ValidationRegistry.ValidationRequest memory req = registry.getValidationStatus(0);
        assertTrue(req.status == ValidationRegistry.ValidationStatus.Validated);
        assertEq(req.score, 95);
    }

    function testValidationRejection() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        vm.prank(validator1);
        registry.validationResponse(0, 20, false, "Reasoning is flawed");

        ValidationRegistry.ValidationRequest memory req = registry.getValidationStatus(0);
        assertTrue(req.status == ValidationRegistry.ValidationStatus.Rejected);
        assertEq(req.score, 20);
    }

    function testOnlyValidatorCanRespond() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        vm.prank(validator2);
        vm.expectRevert("not validator");
        registry.validationResponse(0, 90, true, "");
    }

    function testOwnerCanRespondAsValidator() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        // Owner can override and respond
        registry.validationResponse(0, 85, true, "Owner validated");

        ValidationRegistry.ValidationRequest memory req = registry.getValidationStatus(0);
        assertTrue(req.status == ValidationRegistry.ValidationStatus.Validated);
    }

    function testCannotDoubleRespond() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        vm.prank(validator1);
        registry.validationResponse(0, 90, true, "");

        vm.prank(validator1);
        vm.expectRevert("already responded");
        registry.validationResponse(0, 80, true, "");
    }

    function testScoreOutOfRange() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        vm.prank(validator1);
        vm.expectRevert("score out of range");
        registry.validationResponse(0, 101, true, "");
    }

    function testGetAgentValidations() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest1", CONTENT_HASH, "vote");
        registry.validationRequest(2220, validator2, "ipfs://QmTest2", CONTENT_HASH, "alignment");
        registry.validationRequest(2221, validator1, "ipfs://QmTest3", CONTENT_HASH, "vote");

        ValidationRegistry.ValidationRequest[] memory agent2220 = registry.getAgentValidations(2220);
        assertEq(agent2220.length, 2);

        ValidationRegistry.ValidationRequest[] memory agent2221 = registry.getAgentValidations(2221);
        assertEq(agent2221.length, 1);
    }

    function testGetPendingForValidator() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest1", CONTENT_HASH, "vote");
        registry.validationRequest(2221, validator1, "ipfs://QmTest2", CONTENT_HASH, "vote");

        // Respond to first one
        vm.prank(validator1);
        registry.validationResponse(0, 90, true, "");

        ValidationRegistry.ValidationRequest[] memory pending = registry.getPendingForValidator(validator1);
        assertEq(pending.length, 1);
        assertEq(pending[0].agentId, 2221);
    }

    function testSummary() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest1", CONTENT_HASH, "vote");
        registry.validationRequest(2220, validator2, "ipfs://QmTest2", CONTENT_HASH, "alignment");

        vm.prank(validator1);
        registry.validationResponse(0, 90, true, "");

        vm.prank(validator2);
        registry.validationResponse(1, 70, true, "");

        ValidationRegistry.ValidationSummary memory summary = registry.getSummary(2220);
        assertEq(summary.totalRequests, 2);
        assertEq(summary.validated, 2);
        assertEq(summary.rejected, 0);
        assertEq(summary.pending, 0);
        assertEq(summary.averageScore, 80); // (90+70)/2
    }

    function testSummaryWithRejection() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest1", CONTENT_HASH, "vote");
        registry.validationRequest(2220, validator2, "ipfs://QmTest2", CONTENT_HASH, "vote");

        vm.prank(validator1);
        registry.validationResponse(0, 90, true, "");

        vm.prank(validator2);
        registry.validationResponse(1, 30, false, "Bad reasoning");

        ValidationRegistry.ValidationSummary memory summary = registry.getSummary(2220);
        assertEq(summary.validated, 1);
        assertEq(summary.rejected, 1);
        assertEq(summary.averageScore, 90); // only validated scores count in average
    }

    function testSummaryPendingCount() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest1", CONTENT_HASH, "vote");
        registry.validationRequest(2220, validator2, "ipfs://QmTest2", CONTENT_HASH, "vote");

        ValidationRegistry.ValidationSummary memory summary = registry.getSummary(2220);
        assertEq(summary.totalRequests, 2);
        assertEq(summary.pending, 2);
        assertEq(summary.validated, 0);
    }

    function testZeroAddressValidator() public {
        vm.expectRevert("zero validator");
        registry.validationRequest(2220, address(0), "ipfs://QmTest", CONTENT_HASH, "vote");
    }

    function testApprovedValidators() public {
        assertTrue(registry.approvedValidators(owner));
        assertFalse(registry.approvedValidators(validator1));

        registry.setApprovedValidator(validator1, true);
        assertTrue(registry.approvedValidators(validator1));
    }

    function testTransferOwnership() public {
        registry.transferOwnership(validator1);
        assertEq(registry.owner(), validator1);

        vm.expectRevert("only owner");
        registry.setApprovedValidator(validator2, true);
    }

    function testTotalValidationCount() public {
        assertEq(registry.totalValidationCount(), 0);
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");
        assertEq(registry.totalValidationCount(), 1);
    }

    function testValidationRequestEvents() public {
        vm.expectEmit(true, true, true, true);
        emit ValidationRegistry.ValidationRequested(0, 2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");
    }

    function testValidationResponseEvents() public {
        registry.validationRequest(2220, validator1, "ipfs://QmTest", CONTENT_HASH, "vote");

        vm.prank(validator1);
        vm.expectEmit(true, true, true, true);
        emit ValidationRegistry.ValidationResponded(0, 2220, validator1, 90, ValidationRegistry.ValidationStatus.Validated);
        registry.validationResponse(0, 90, true, "");
    }

    function testMultipleActionTypes() public {
        registry.validationRequest(2220, validator1, "ipfs://Qm1", CONTENT_HASH, "vote");
        registry.validationRequest(2220, validator1, "ipfs://Qm2", CONTENT_HASH, "reasoning");
        registry.validationRequest(2220, validator1, "ipfs://Qm3", CONTENT_HASH, "alignment");

        ValidationRegistry.ValidationRequest[] memory all = registry.getAgentValidations(2220);
        assertEq(all.length, 3);
    }
}

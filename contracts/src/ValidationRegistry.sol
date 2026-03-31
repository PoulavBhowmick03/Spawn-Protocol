// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ValidationRegistry — ERC-8004 Validation Registry for agent work verification
/// @notice Allows validators to independently verify agent actions. Parent agents
///         validate children's voting decisions, and children can cross-validate
///         each other's reasoning. Satisfies the ERC-8004 "validation registry"
///         requirement for the Agents With Receipts track.
contract ValidationRegistry {
    enum ValidationStatus { Pending, Validated, Rejected, Expired }

    struct ValidationRequest {
        uint256 id;
        uint256 agentId;           // ERC-8004 agent ID being validated
        address requester;         // who requested the validation
        address validator;         // who should validate
        string uri;                // pointer to the work being validated (e.g., IPFS CID)
        bytes32 contentHash;       // keccak256 of the content for integrity
        string actionType;         // what type of action (e.g., "vote", "reasoning", "alignment")
        ValidationStatus status;
        uint256 score;             // validator's score 0-100 (0 if not yet validated)
        string validatorComment;   // validator's notes
        uint256 requestedAt;
        uint256 respondedAt;
    }

    struct ValidationSummary {
        uint256 totalRequests;
        uint256 validated;
        uint256 rejected;
        uint256 pending;
        uint256 averageScore;
        uint256 lastValidated;
    }

    // All validation requests
    ValidationRequest[] public validations;

    // agentId => array of validation request indices
    mapping(uint256 => uint256[]) public agentValidationIds;

    // validator address => array of validation request indices
    mapping(address => uint256[]) public validatorRequestIds;

    // agentId => cached summary
    mapping(uint256 => ValidationSummary) private _summaries;

    address public owner;

    // Approved validators (parent agents, cross-validating children)
    mapping(address => bool) public approvedValidators;

    event ValidationRequested(
        uint256 indexed requestId,
        uint256 indexed agentId,
        address indexed validator,
        string uri,
        bytes32 contentHash,
        string actionType
    );

    event ValidationResponded(
        uint256 indexed requestId,
        uint256 indexed agentId,
        address indexed validator,
        uint256 score,
        ValidationStatus status
    );

    event ValidatorApproved(address indexed validator, bool approved);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        approvedValidators[msg.sender] = true;
    }

    /// @notice Request validation of an agent's work
    /// @param agentId The ERC-8004 agent ID being validated
    /// @param validator Address of the validator
    /// @param uri Pointer to the work (IPFS CID, URL, etc.)
    /// @param contentHash keccak256 of the content being validated
    /// @param actionType Type of action being validated
    function validationRequest(
        uint256 agentId,
        address validator,
        string calldata uri,
        bytes32 contentHash,
        string calldata actionType
    ) external returns (uint256 requestId) {
        require(validator != address(0), "zero validator");

        requestId = validations.length;
        validations.push(ValidationRequest({
            id: requestId,
            agentId: agentId,
            requester: msg.sender,
            validator: validator,
            uri: uri,
            contentHash: contentHash,
            actionType: actionType,
            status: ValidationStatus.Pending,
            score: 0,
            validatorComment: "",
            requestedAt: block.timestamp,
            respondedAt: 0
        }));

        agentValidationIds[agentId].push(requestId);
        validatorRequestIds[validator].push(requestId);

        // Update pending count in summary
        _updateSummary(agentId);

        emit ValidationRequested(requestId, agentId, validator, uri, contentHash, actionType);
    }

    /// @notice Validator responds to a validation request
    /// @param requestId The validation request ID
    /// @param score Validation score 0-100
    /// @param approved Whether the work is validated or rejected
    /// @param comment Optional validator comment
    function validationResponse(
        uint256 requestId,
        uint256 score,
        bool approved,
        string calldata comment
    ) external {
        require(requestId < validations.length, "invalid request id");
        ValidationRequest storage req = validations[requestId];
        require(msg.sender == req.validator || msg.sender == owner, "not validator");
        require(req.status == ValidationStatus.Pending, "already responded");
        require(score <= 100, "score out of range");

        req.score = score;
        req.status = approved ? ValidationStatus.Validated : ValidationStatus.Rejected;
        req.validatorComment = comment;
        req.respondedAt = block.timestamp;

        // Update summary
        _updateSummary(req.agentId);

        emit ValidationResponded(requestId, req.agentId, msg.sender, score, req.status);
    }

    /// @notice Get validation request details
    function getValidationStatus(uint256 requestId) external view returns (ValidationRequest memory) {
        require(requestId < validations.length, "invalid request id");
        return validations[requestId];
    }

    /// @notice Get all validation requests for an agent
    function getAgentValidations(uint256 agentId) external view returns (ValidationRequest[] memory result) {
        uint256[] storage ids = agentValidationIds[agentId];
        result = new ValidationRequest[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = validations[ids[i]];
        }
    }

    /// @notice Get pending validation requests for a validator
    function getPendingForValidator(address validator) external view returns (ValidationRequest[] memory) {
        uint256[] storage ids = validatorRequestIds[validator];
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (validations[ids[i]].status == ValidationStatus.Pending) pendingCount++;
        }
        ValidationRequest[] memory result = new ValidationRequest[](pendingCount);
        uint256 j = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (validations[ids[i]].status == ValidationStatus.Pending) {
                result[j++] = validations[ids[i]];
            }
        }
        return result;
    }

    /// @notice Get aggregated validation summary for an agent
    function getSummary(uint256 agentId) external view returns (ValidationSummary memory) {
        return _summaries[agentId];
    }

    /// @notice Get total number of validation requests
    function totalValidationCount() external view returns (uint256) {
        return validations.length;
    }

    /// @notice Approve or revoke a validator
    function setApprovedValidator(address validator, bool approved) external onlyOwner {
        approvedValidators[validator] = approved;
        emit ValidatorApproved(validator, approved);
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    // --- Internal ---

    function _updateSummary(uint256 agentId) internal {
        uint256[] storage ids = agentValidationIds[agentId];
        uint256 validatedCount = 0;
        uint256 rejectedCount = 0;
        uint256 pendingCount = 0;
        uint256 totalScore = 0;
        uint256 lastTime = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            ValidationRequest storage req = validations[ids[i]];
            if (req.status == ValidationStatus.Validated) {
                validatedCount++;
                totalScore += req.score;
                if (req.respondedAt > lastTime) lastTime = req.respondedAt;
            } else if (req.status == ValidationStatus.Rejected) {
                rejectedCount++;
                if (req.respondedAt > lastTime) lastTime = req.respondedAt;
            } else if (req.status == ValidationStatus.Pending) {
                pendingCount++;
            }
        }

        _summaries[agentId] = ValidationSummary({
            totalRequests: ids.length,
            validated: validatedCount,
            rejected: rejectedCount,
            pending: pendingCount,
            averageScore: validatedCount > 0 ? totalScore / validatedCount : 0,
            lastValidated: lastTime
        });
    }
}

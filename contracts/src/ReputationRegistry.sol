// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ReputationRegistry — ERC-8004 Reputation Registry for agent feedback
/// @notice Tracks onchain feedback for registered agents. Parent agents submit
///         alignment evaluations, children can rate each other, and any operator
///         can leave signed feedback. Satisfies the ERC-8004 "reputation registry"
///         requirement for the Agents With Receipts track.
contract ReputationRegistry {
    struct Feedback {
        uint256 id;
        uint256 agentId;       // ERC-8004 agent ID being rated
        address reviewer;      // who submitted the feedback
        uint256 score;         // 0-100
        string tags;           // comma-separated tags (e.g., "alignment,voting,drift")
        string endpoint;       // which action triggered the feedback (e.g., "evaluate_alignment")
        string comment;        // optional free-text
        uint256 timestamp;
        bool revoked;
    }

    struct ReputationSummary {
        uint256 totalFeedback;
        uint256 activeFeedback;
        uint256 averageScore;
        uint256 highestScore;
        uint256 lowestScore;
        uint256 lastUpdated;
    }

    // All feedback entries
    Feedback[] public feedbacks;

    // agentId => array of feedback indices
    mapping(uint256 => uint256[]) public agentFeedbackIds;

    // reviewer => array of feedback indices (for revoking)
    mapping(address => uint256[]) public reviewerFeedbackIds;

    // agentId => cached summary
    mapping(uint256 => ReputationSummary) private _summaries;

    address public owner;

    // Trusted reviewers (parent agents, operators) — anyone can give feedback,
    // but trusted reviewers' feedback is weighted in the summary
    mapping(address => bool) public trustedReviewers;

    event FeedbackGiven(
        uint256 indexed feedbackId,
        uint256 indexed agentId,
        address indexed reviewer,
        uint256 score,
        string tags,
        string endpoint
    );

    event FeedbackRevoked(uint256 indexed feedbackId, uint256 indexed agentId, address indexed reviewer);

    event TrustedReviewerSet(address indexed reviewer, bool trusted);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        trustedReviewers[msg.sender] = true;
    }

    /// @notice Submit feedback for an agent
    /// @param agentId The ERC-8004 agent ID being rated
    /// @param score Rating 0-100
    /// @param tags Comma-separated tags describing the feedback context
    /// @param endpoint The action/endpoint that triggered this feedback
    /// @param comment Optional free-text comment
    function giveFeedback(
        uint256 agentId,
        uint256 score,
        string calldata tags,
        string calldata endpoint,
        string calldata comment
    ) external returns (uint256 feedbackId) {
        require(score <= 100, "score out of range");

        feedbackId = feedbacks.length;
        feedbacks.push(Feedback({
            id: feedbackId,
            agentId: agentId,
            reviewer: msg.sender,
            score: score,
            tags: tags,
            endpoint: endpoint,
            comment: comment,
            timestamp: block.timestamp,
            revoked: false
        }));

        agentFeedbackIds[agentId].push(feedbackId);
        reviewerFeedbackIds[msg.sender].push(feedbackId);

        // Update cached summary
        _updateSummary(agentId);

        emit FeedbackGiven(feedbackId, agentId, msg.sender, score, tags, endpoint);
    }

    /// @notice Revoke previously submitted feedback
    /// @param feedbackId The ID of the feedback to revoke
    function revokeFeedback(uint256 feedbackId) external {
        require(feedbackId < feedbacks.length, "invalid feedback id");
        Feedback storage fb = feedbacks[feedbackId];
        require(fb.reviewer == msg.sender || msg.sender == owner, "not reviewer or owner");
        require(!fb.revoked, "already revoked");

        fb.revoked = true;

        // Update cached summary
        _updateSummary(fb.agentId);

        emit FeedbackRevoked(feedbackId, fb.agentId, msg.sender);
    }

    /// @notice Read all feedback for an agent
    /// @param agentId The ERC-8004 agent ID
    /// @return result Array of Feedback structs
    function readFeedback(uint256 agentId) external view returns (Feedback[] memory result) {
        uint256[] storage ids = agentFeedbackIds[agentId];
        result = new Feedback[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = feedbacks[ids[i]];
        }
    }

    /// @notice Read only active (non-revoked) feedback for an agent
    /// @param agentId The ERC-8004 agent ID
    function readActiveFeedback(uint256 agentId) external view returns (Feedback[] memory) {
        uint256[] storage ids = agentFeedbackIds[agentId];
        // Count active first
        uint256 activeCount = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!feedbacks[ids[i]].revoked) activeCount++;
        }
        // Build result
        Feedback[] memory result = new Feedback[](activeCount);
        uint256 j = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!feedbacks[ids[i]].revoked) {
                result[j++] = feedbacks[ids[i]];
            }
        }
        return result;
    }

    /// @notice Get aggregated reputation summary for an agent
    /// @param agentId The ERC-8004 agent ID
    function getSummary(uint256 agentId) external view returns (ReputationSummary memory) {
        return _summaries[agentId];
    }

    /// @notice Get feedback count for an agent
    function getFeedbackCount(uint256 agentId) external view returns (uint256 total, uint256 active) {
        uint256[] storage ids = agentFeedbackIds[agentId];
        total = ids.length;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!feedbacks[ids[i]].revoked) active++;
        }
    }

    /// @notice Get total number of feedback entries across all agents
    function totalFeedbackCount() external view returns (uint256) {
        return feedbacks.length;
    }

    /// @notice Set a trusted reviewer (parent agent, operator)
    function setTrustedReviewer(address reviewer, bool trusted) external onlyOwner {
        trustedReviewers[reviewer] = trusted;
        emit TrustedReviewerSet(reviewer, trusted);
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    // --- Internal ---

    function _updateSummary(uint256 agentId) internal {
        uint256[] storage ids = agentFeedbackIds[agentId];
        uint256 totalScore = 0;
        uint256 activeCount = 0;
        uint256 highest = 0;
        uint256 lowest = 100;

        for (uint256 i = 0; i < ids.length; i++) {
            Feedback storage fb = feedbacks[ids[i]];
            if (!fb.revoked) {
                activeCount++;
                totalScore += fb.score;
                if (fb.score > highest) highest = fb.score;
                if (fb.score < lowest) lowest = fb.score;
            }
        }

        _summaries[agentId] = ReputationSummary({
            totalFeedback: ids.length,
            activeFeedback: activeCount,
            averageScore: activeCount > 0 ? totalScore / activeCount : 0,
            highestScore: activeCount > 0 ? highest : 0,
            lowestScore: activeCount > 0 ? lowest : 0,
            lastUpdated: block.timestamp
        });
    }
}

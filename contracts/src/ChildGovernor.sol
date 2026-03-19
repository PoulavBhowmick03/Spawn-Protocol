// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title ChildGovernor — Implementation contract for cloned child agents
/// @notice Each child agent gets a minimal proxy clone of this contract
contract ChildGovernor is Initializable {
    struct VoteRecord {
        uint256 proposalId;
        uint8 support;
        bytes encryptedRationale;
        bytes decryptedRationale;
        uint256 timestamp;
        bool revealed;
    }

    address public parent;
    address public factory;
    address public governance;
    address public operator; // child's unique wallet — can cast votes
    uint256 public maxGasPerVote;
    uint256 public alignmentScore;
    bool public active;

    VoteRecord[] public voteHistory;
    mapping(uint256 => uint256) public proposalToVoteIndex; // proposalId => index+1 (0 = not voted)

    event VoteCast(uint256 indexed proposalId, uint8 support, bytes encryptedRationale);
    event RationaleRevealed(uint256 indexed proposalId, bytes rationale);
    event AlignmentUpdated(uint256 newScore);
    event Deactivated();

    modifier onlyAuthorized() {
        require(msg.sender == parent || msg.sender == factory || msg.sender == operator, "unauthorized");
        _;
    }

    modifier onlyActive() {
        require(active, "child deactivated");
        _;
    }

    function initialize(
        address _parent,
        address _factory,
        address _governance,
        uint256 _maxGas
    ) external initializer {
        parent = _parent;
        factory = _factory;
        governance = _governance;
        maxGasPerVote = _maxGas;
        alignmentScore = 100;
        active = true;
    }

    /// @notice Parent or factory sets the child's unique wallet as operator
    function setOperator(address _operator) external {
        require(msg.sender == parent || msg.sender == factory, "only parent or factory");
        operator = _operator;
    }

    function castVote(
        uint256 proposalId,
        uint8 support,
        bytes calldata encryptedRationale
    ) external onlyAuthorized onlyActive {
        require(proposalToVoteIndex[proposalId] == 0, "already voted");
        require(support <= 2, "invalid support");
        // maxGasPerVote enforced off-chain by agent (sets tx gas limit)

        voteHistory.push(VoteRecord({
            proposalId: proposalId,
            support: support,
            encryptedRationale: encryptedRationale,
            decryptedRationale: "",
            timestamp: block.timestamp,
            revealed: false
        }));
        proposalToVoteIndex[proposalId] = voteHistory.length; // 1-indexed

        emit VoteCast(proposalId, support, encryptedRationale);
    }

    function revealRationale(
        uint256 proposalId,
        bytes calldata decryptedRationale
    ) external onlyAuthorized {
        uint256 idx = proposalToVoteIndex[proposalId];
        require(idx != 0, "no vote for proposal");
        VoteRecord storage record = voteHistory[idx - 1];
        require(!record.revealed, "already revealed");

        record.decryptedRationale = decryptedRationale;
        record.revealed = true;

        emit RationaleRevealed(proposalId, decryptedRationale);
    }

    function updateAlignmentScore(uint256 score) external {
        require(msg.sender == parent, "only parent");
        require(score <= 100, "score out of range");
        alignmentScore = score;
        emit AlignmentUpdated(score);
    }

    function deactivate() external onlyAuthorized {
        active = false;
        emit Deactivated();
    }

    function getVotingHistory() external view returns (VoteRecord[] memory) {
        return voteHistory;
    }

    function getVoteCount() external view returns (uint256) {
        return voteHistory.length;
    }

    receive() external payable {}
}

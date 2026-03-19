// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ChildGovernor.sol";

interface ITreasuryCaps {
    function maxChildren() external view returns (uint256);
    function maxBudgetPerChild() external view returns (uint256);
}

/// @title SpawnFactory — Spawns and manages child governance agents via EIP-1167 minimal proxies
contract SpawnFactory {
    struct ChildInfo {
        uint256 id;
        address childAddr;
        address governance;
        uint256 budget;
        uint256 maxGasPerVote;
        string ensLabel;
        bool active;
    }

    address public parentAgent;
    address public treasury;
    address public childImplementation;

    uint256 public childCount;
    mapping(uint256 => ChildInfo) public children;
    uint256[] public activeChildIds;
    mapping(uint256 => uint256) private activeIndex; // childId => index in activeChildIds

    event ChildSpawned(uint256 indexed childId, address childAddr, address governance, uint256 budget);
    event ChildTerminated(uint256 indexed childId, address childAddr, uint256 fundsReturned);
    event FundsReallocated(uint256 indexed fromId, uint256 indexed toId, uint256 amount);

    modifier onlyParent() {
        require(msg.sender == parentAgent, "only parent agent");
        _;
    }

    constructor(address _treasury, address _childImplementation) {
        treasury = _treasury;
        childImplementation = _childImplementation;
        // parentAgent set via setParentAgent from treasury
    }

    function setParentAgent(address _parentAgent) external {
        require(msg.sender == treasury, "only treasury");
        parentAgent = _parentAgent;
    }

    function spawnChild(
        string calldata ensLabel,
        address governanceTarget,
        uint256 budget,
        uint256 maxGasPerVote
    ) external onlyParent returns (uint256 childId) {
        // Enforce treasury caps
        uint256 maxKids = ITreasuryCaps(treasury).maxChildren();
        uint256 maxBudget = ITreasuryCaps(treasury).maxBudgetPerChild();
        require(activeChildIds.length < maxKids, "max children reached");
        require(budget <= maxBudget, "exceeds max budget per child");

        childId = ++childCount;

        address clone = Clones.clone(childImplementation);
        ChildGovernor(payable(clone)).initialize(
            parentAgent,
            address(this),
            governanceTarget,
            maxGasPerVote
        );

        children[childId] = ChildInfo({
            id: childId,
            childAddr: clone,
            governance: governanceTarget,
            budget: budget,
            maxGasPerVote: maxGasPerVote,
            ensLabel: ensLabel,
            active: true
        });

        activeChildIds.push(childId);
        activeIndex[childId] = activeChildIds.length - 1;

        // Transfer budget to child
        if (budget > 0) {
            (bool ok,) = clone.call{value: budget}("");
            require(ok, "budget transfer failed");
        }

        emit ChildSpawned(childId, clone, governanceTarget, budget);
    }

    function recallChild(uint256 childId) external onlyParent {
        ChildInfo storage info = children[childId];
        require(info.active, "child not active");

        info.active = false;

        // Deactivate the child contract
        ChildGovernor(payable(info.childAddr)).deactivate();

        // Pull remaining funds back
        uint256 balance = info.childAddr.balance;
        if (balance > 0) {
            (bool ok,) = treasury.call{value: balance}("");
            require(ok, "fund return failed");
        }

        // Remove from active list (swap and pop)
        uint256 idx = activeIndex[childId];
        uint256 lastId = activeChildIds[activeChildIds.length - 1];
        activeChildIds[idx] = lastId;
        activeIndex[lastId] = idx;
        activeChildIds.pop();
        delete activeIndex[childId];

        emit ChildTerminated(childId, info.childAddr, balance);
    }

    function reallocate(uint256 fromId, uint256 toId, uint256 amount) external onlyParent {
        ChildInfo storage from = children[fromId];
        ChildInfo storage to = children[toId];
        require(from.active && to.active, "both must be active");
        require(from.childAddr.balance >= amount, "insufficient funds");

        from.budget -= amount;
        to.budget += amount;

        // Note: actual ETH movement would need a withdraw pattern on ChildGovernor
        // For demo purposes, tracking budget allocation
        emit FundsReallocated(fromId, toId, amount);
    }

    function getActiveChildren() external view returns (ChildInfo[] memory) {
        ChildInfo[] memory result = new ChildInfo[](activeChildIds.length);
        for (uint256 i = 0; i < activeChildIds.length; i++) {
            result[i] = children[activeChildIds[i]];
        }
        return result;
    }

    function getActiveChildCount() external view returns (uint256) {
        return activeChildIds.length;
    }

    function getChild(uint256 childId) external view returns (ChildInfo memory) {
        return children[childId];
    }

    receive() external payable {}
}

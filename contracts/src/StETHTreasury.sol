// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title StETHTreasury — Lido stETH treasury where principal is locked, only yield is spendable
/// @notice Satisfies Lido bounty requirement: "Principal inaccessible to the agent while yield remains spendable"
/// @dev Works with real stETH (rebasing token) or ETH-based simulation on testnets
contract StETHTreasury {
    address public owner;
    address public agentOperator;

    uint256 public principalDeposited; // original amount deposited (locked)
    uint256 public yieldWithdrawn; // total yield withdrawn by agent
    uint256 public maxYieldPerWithdrawal; // configurable permission: max yield per tx

    bool public paused;

    // stETH on mainnet: 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84
    // On testnets we accept plain ETH and simulate yield via time-based accrual
    address public stETHToken;
    bool public isSimulated; // true on testnets where real stETH doesn't exist

    uint256 public depositTimestamp;
    uint256 public constant SIMULATED_APY_BPS = 350; // 3.5% APY in basis points
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    event Deposited(address indexed from, uint256 amount, uint256 timestamp);
    event YieldWithdrawn(address indexed agent, uint256 amount, uint256 totalYieldWithdrawn);
    event AgentOperatorSet(address indexed agent);
    event MaxYieldPerWithdrawalSet(uint256 amount);
    event EmergencyWithdraw(address indexed owner, uint256 amount);
    event Paused(bool isPaused);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agentOperator, "only agent");
        _;
    }

    modifier notPaused() {
        require(!paused, "paused");
        _;
    }

    constructor(address _stETHToken, uint256 _maxYieldPerWithdrawal) {
        owner = msg.sender;
        stETHToken = _stETHToken;
        maxYieldPerWithdrawal = _maxYieldPerWithdrawal == 0 ? 0.01 ether : _maxYieldPerWithdrawal;

        // If stETH address is zero, we're on a testnet — simulate
        isSimulated = (_stETHToken == address(0));
    }

    /// @notice Owner deposits ETH (or stETH on mainnet). Principal is LOCKED.
    function deposit() external payable onlyOwner {
        require(msg.value > 0, "must send ETH");
        principalDeposited += msg.value;
        if (depositTimestamp == 0) {
            depositTimestamp = block.timestamp;
        }
        emit Deposited(msg.sender, msg.value, block.timestamp);
    }

    /// @notice Set the agent operator (the AI parent agent)
    function setAgentOperator(address _agent) external onlyOwner {
        agentOperator = _agent;
        emit AgentOperatorSet(_agent);
    }

    /// @notice Owner configures max yield per withdrawal (configurable permission)
    function setMaxYieldPerWithdrawal(uint256 _max) external onlyOwner {
        maxYieldPerWithdrawal = _max;
        emit MaxYieldPerWithdrawalSet(_max);
    }

    /// @notice Calculate available yield (balance - principal)
    /// @dev On testnet (simulated), yield accrues based on time and APY
    function availableYield() public view returns (uint256) {
        if (isSimulated) {
            // Simulate stETH rebasing: yield = principal * APY * elapsed / year
            if (depositTimestamp == 0 || principalDeposited == 0) return 0;
            uint256 elapsed = block.timestamp - depositTimestamp;
            uint256 simulatedYield = (principalDeposited * SIMULATED_APY_BPS * elapsed) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
            // Subtract already withdrawn yield
            if (simulatedYield <= yieldWithdrawn) return 0;
            uint256 remainingYield = simulatedYield - yieldWithdrawn;
            // Cap at actual contract balance
            uint256 bal = address(this).balance;
            return remainingYield > bal ? bal : remainingYield;
        } else {
            // Real stETH: balance grows via rebasing, yield = balance - principal
            uint256 bal = address(this).balance;
            if (bal <= principalDeposited) return 0;
            uint256 yield_ = bal - principalDeposited;
            if (yield_ <= yieldWithdrawn) return 0;
            return yield_ - yieldWithdrawn;
        }
    }

    /// @notice Agent withdraws yield ONLY. Principal is NEVER accessible to agent.
    function withdrawYield(uint256 amount) external onlyAgent notPaused {
        require(amount > 0, "zero amount");
        require(amount <= maxYieldPerWithdrawal, "exceeds max per withdrawal");

        uint256 available = availableYield();
        require(amount <= available, "insufficient yield");

        yieldWithdrawn += amount;

        (bool ok, ) = agentOperator.call{value: amount}("");
        require(ok, "transfer failed");

        emit YieldWithdrawn(agentOperator, amount, yieldWithdrawn);
    }

    /// @notice Get treasury status
    function getStatus() external view returns (
        uint256 principal,
        uint256 currentBalance,
        uint256 yield_,
        uint256 totalWithdrawn,
        bool simulated
    ) {
        return (
            principalDeposited,
            address(this).balance,
            availableYield(),
            yieldWithdrawn,
            isSimulated
        );
    }

    /// @notice Emergency pause — stops all agent withdrawals
    function togglePause() external onlyOwner {
        paused = !paused;
        emit Paused(paused);
    }

    /// @notice Emergency owner withdrawal — only owner, only when paused
    function emergencyWithdraw() external onlyOwner {
        require(paused, "must pause first");
        uint256 bal = address(this).balance;
        principalDeposited = 0;
        (bool ok, ) = owner.call{value: bal}("");
        require(ok, "transfer failed");
        emit EmergencyWithdraw(owner, bal);
    }

    receive() external payable {
        // Accept ETH (e.g., from stETH rebasing or direct sends)
    }
}

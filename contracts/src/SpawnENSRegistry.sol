// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SpawnENSRegistry — Minimal onchain ENS-like registry for agent identity
/// @notice Deployed on Base Sepolia where real ENS doesn't exist.
///         Satisfies ENS Identity, ENS Communication, and ENS Open Integration bounties.
contract SpawnENSRegistry {
    struct NameRecord {
        address owner;
        address resolvedAddress;
        string name; // e.g., "uniswap-dao.spawn.eth"
        uint256 registeredAt;
    }

    // namehash => record (public getter auto-generated for basic fields)
    mapping(bytes32 => NameRecord) private _records;
    // namehash => key => value for text records
    mapping(bytes32 => mapping(string => string)) private _textRecords;
    // address => namehash for reverse resolution
    mapping(address => bytes32) public reverseRecords;

    // Track all registered labels for enumeration
    string[] private _registeredLabels;
    mapping(bytes32 => uint256) private _labelIndex; // node => index+1 (0 means not registered)

    string public parentDomain = "spawn.eth";
    address public owner;

    event NameRegistered(bytes32 indexed node, string name, address indexed resolvedAddress);
    event NameDeregistered(bytes32 indexed node, string name);
    event TextRecordSet(bytes32 indexed node, string key, string value);
    event AddressChanged(bytes32 indexed node, address newAddress);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Compute a simple namehash for a label under spawn.eth
    function computeNode(string calldata label) external pure returns (bytes32) {
        return _computeNode(label);
    }

    function _computeNode(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(label));
    }

    /// @notice Register a subdomain (e.g., "uniswap-dao" => "uniswap-dao.spawn.eth")
    function registerSubdomain(string calldata label, address addr) external onlyOwner returns (bytes32 node) {
        node = _computeNode(label);
        require(_records[node].registeredAt == 0, "already registered");
        require(addr != address(0), "zero address");

        string memory fullName = string(abi.encodePacked(label, ".", parentDomain));

        _records[node] = NameRecord({
            owner: msg.sender,
            resolvedAddress: addr,
            name: fullName,
            registeredAt: block.timestamp
        });

        reverseRecords[addr] = node;

        // Track for enumeration
        _registeredLabels.push(label);
        _labelIndex[node] = _registeredLabels.length; // index+1

        emit NameRegistered(node, fullName, addr);
    }

    /// @notice Deregister a subdomain
    function deregisterSubdomain(string calldata label) external onlyOwner {
        bytes32 node = _computeNode(label);
        NameRecord storage record = _records[node];
        require(record.registeredAt != 0, "not registered");

        string memory fullName = record.name;
        address resolvedAddr = record.resolvedAddress;

        // Clear reverse record
        if (reverseRecords[resolvedAddr] == node) {
            delete reverseRecords[resolvedAddr];
        }

        // Remove from enumeration (swap and pop)
        uint256 idxPlusOne = _labelIndex[node];
        if (idxPlusOne > 0) {
            uint256 idx = idxPlusOne - 1;
            uint256 lastIdx = _registeredLabels.length - 1;
            if (idx != lastIdx) {
                string memory lastLabel = _registeredLabels[lastIdx];
                _registeredLabels[idx] = lastLabel;
                _labelIndex[_computeNode(lastLabel)] = idx + 1;
            }
            _registeredLabels.pop();
            delete _labelIndex[node];
        }

        delete _records[node];

        emit NameDeregistered(node, fullName);
    }

    /// @notice Resolve a label to an address
    function resolve(string calldata label) external view returns (address) {
        bytes32 node = _computeNode(label);
        return _records[node].resolvedAddress;
    }

    /// @notice Reverse resolve an address to a name
    function reverseResolve(address addr) external view returns (string memory) {
        bytes32 node = reverseRecords[addr];
        if (node == bytes32(0)) return "";
        return _records[node].name;
    }

    /// @notice Set a text record on a subdomain
    function setTextRecord(string calldata label, string calldata key, string calldata value) external onlyOwner {
        bytes32 node = _computeNode(label);
        require(_records[node].registeredAt != 0, "not registered");

        _textRecords[node][key] = value;

        emit TextRecordSet(node, key, value);
    }

    /// @notice Get a text record from a subdomain
    function getTextRecord(string calldata label, string calldata key) external view returns (string memory) {
        bytes32 node = _computeNode(label);
        return _textRecords[node][key];
    }

    /// @notice Update the resolved address of a subdomain
    function updateAddress(string calldata label, address newAddr) external onlyOwner {
        bytes32 node = _computeNode(label);
        NameRecord storage record = _records[node];
        require(record.registeredAt != 0, "not registered");
        require(newAddr != address(0), "zero address");

        // Clear old reverse record
        address oldAddr = record.resolvedAddress;
        if (reverseRecords[oldAddr] == node) {
            delete reverseRecords[oldAddr];
        }

        record.resolvedAddress = newAddr;
        reverseRecords[newAddr] = node;

        emit AddressChanged(node, newAddr);
    }

    /// @notice Get all registered subdomains
    function getAllSubdomains() external view returns (string[] memory names, address[] memory addresses) {
        uint256 len = _registeredLabels.length;
        names = new string[](len);
        addresses = new address[](len);

        for (uint256 i = 0; i < len; i++) {
            bytes32 node = _computeNode(_registeredLabels[i]);
            names[i] = _records[node].name;
            addresses[i] = _records[node].resolvedAddress;
        }
    }

    /// @notice Get record details for a label
    function getRecord(string calldata label) external view returns (
        address recordOwner,
        address resolvedAddress,
        string memory name,
        uint256 registeredAt
    ) {
        bytes32 node = _computeNode(label);
        NameRecord storage record = _records[node];
        return (record.owner, record.resolvedAddress, record.name, record.registeredAt);
    }

    /// @notice Get the number of registered subdomains
    function subdomainCount() external view returns (uint256) {
        return _registeredLabels.length;
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}

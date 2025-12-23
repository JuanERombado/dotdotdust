// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IXCM
 * @dev Mock Interface for Polkadot Revive XCM Precompiles.
 * In production, this would interface with the actual precompile address (e.g. 0x000...0400).
 */
interface IXCM {
    /// @notice Execute an XCM message via Transact.
    /// @param message The XCM message encoded as bytes.
    /// @param maxWeight The maximum weight to usage.
    function execute_xcm(bytes calldata message, uint64 maxWeight) external payable;

    /// @notice Send an XCM message (XCMP).
    /// @param dest The destination MultiLocation.
    /// @param message The XCM message.
    function send_xcm(bytes calldata dest, bytes calldata message) external;
}

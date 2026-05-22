// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRoles {
  function execTransactionWithRole(
    address to,
    uint256 value,
    bytes calldata data,
    uint8 operation,
    bytes32 roleKey,
    bool shouldRevert
  ) external returns (bool success);
}

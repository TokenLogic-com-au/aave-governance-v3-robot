// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IRoles} from '../../src/interfaces/IRoles.sol';

contract MockRoles is IRoles {
  address public lastTo;
  uint256 public lastValue;
  bytes public lastData;
  uint8 public lastOperation;
  bytes32 public lastRoleKey;
  bool public lastShouldRevert;
  uint256 public callCount;

  function execTransactionWithRole(
    address to,
    uint256 value,
    bytes calldata data,
    uint8 operation,
    bytes32 roleKey,
    bool shouldRevert
  ) external returns (bool success) {
    lastTo = to;
    lastValue = value;
    lastData = data;
    lastOperation = operation;
    lastRoleKey = roleKey;
    lastShouldRevert = shouldRevert;
    callCount++;
    return true;
  }
}

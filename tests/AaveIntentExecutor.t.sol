// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from 'forge-std/Test.sol';
import {AaveIntentExecutor} from '../src/contracts/cre-receivers/AaveIntentExecutor.sol';
import {ReceiverTemplate} from '../src/contracts/cre-receivers/ReceiverTemplate.sol';
import {IRoles} from '../src/interfaces/IRoles.sol';

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

contract AaveIntentExecutorTest is Test {
  AaveIntentExecutor internal executor;
  MockRoles internal roles;

  address internal forwarder = makeAddr('forwarder');
  address internal owner = makeAddr('owner');
  address internal steward = makeAddr('steward');
  bytes32 internal constant ROLE_KEY = bytes32(uint256(0xa11c3));

  function setUp() public {
    roles = new MockRoles();
    executor = new AaveIntentExecutor(forwarder, address(roles), steward, ROLE_KEY, owner);
  }

  function test_constructor_SetsImmutables() public {
    assertEq(executor.roles(), address(roles));
    assertEq(executor.steward(), steward);
    assertEq(executor.roleKey(), ROLE_KEY);
    assertEq(executor.owner(), owner);
    assertEq(executor.getForwarderAddress(), forwarder);
  }

  function test_constructor_RevertsOnZeroRoles() public {
    vm.expectRevert(AaveIntentExecutor.ZeroAddress.selector);
    new AaveIntentExecutor(forwarder, address(0), steward, ROLE_KEY, owner);
  }

  function test_constructor_RevertsOnZeroSteward() public {
    vm.expectRevert(AaveIntentExecutor.ZeroAddress.selector);
    new AaveIntentExecutor(forwarder, address(roles), address(0), ROLE_KEY, owner);
  }

  function test_constructor_RevertsOnZeroForwarder() public {
    vm.expectRevert(ReceiverTemplate.InvalidForwarderAddress.selector);
    new AaveIntentExecutor(address(0), address(roles), steward, ROLE_KEY, owner);
  }

  function test_constructor_RevertsOnZeroOwner() public {
    vm.expectRevert(ReceiverTemplate.InvalidInitialOwner.selector);
    new AaveIntentExecutor(forwarder, address(roles), steward, ROLE_KEY, address(0));
  }

  function test_onReport_ForwardsToRolesWithCorrectArgs() public {
    bytes memory report = hex'1234deadbeef';
    vm.prank(forwarder);
    executor.onReport('', report);

    assertEq(roles.callCount(), 1);
    assertEq(roles.lastTo(), steward);
    assertEq(roles.lastValue(), 0);
    assertEq(roles.lastData(), report);
    assertEq(uint256(roles.lastOperation()), 0);
    assertEq(roles.lastRoleKey(), ROLE_KEY);
    assertTrue(roles.lastShouldRevert());
  }

  function test_onReport_RevertsIfSenderNotForwarder() public {
    vm.expectRevert(
      abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), forwarder)
    );
    executor.onReport('', hex'01');
    assertEq(roles.callCount(), 0);
  }

  function test_onReport_ForwardsArbitraryReportPayload(bytes calldata payload) public {
    vm.prank(forwarder);
    executor.onReport('', payload);
    assertEq(roles.lastData(), payload);
  }
}

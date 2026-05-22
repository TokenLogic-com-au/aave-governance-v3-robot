// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from 'forge-std/Test.sol';
import {ReceiverTemplate} from '../src/contracts/cre-receivers/ReceiverTemplate.sol';
import {IReceiver} from '../src/interfaces/IReceiver.sol';
import {IERC165} from 'openzeppelin-contracts/contracts/utils/introspection/IERC165.sol';

contract MockReceiver is ReceiverTemplate {
  bytes public lastReport;

  constructor(
    address _forwarder,
    address _initialOwner
  ) ReceiverTemplate(_forwarder, _initialOwner) {}

  function _processReport(bytes calldata report) internal override {
    lastReport = report;
  }
}

contract ReceiverTemplateTest is Test {
  MockReceiver internal receiver;

  address internal forwarder = makeAddr('forwarder');
  address internal owner = makeAddr('owner');
  address internal stranger = makeAddr('stranger');
  address internal author = makeAddr('author');

  bytes32 internal constant WORKFLOW_ID = bytes32(uint256(0xdeadbeef));

  // OZ v4; v5 uses OwnableUnauthorizedAccount(address) custom error.
  bytes internal constant NOT_OWNER_REVERT = bytes('Ownable: caller is not the owner');

  event ForwarderAddressUpdated(address indexed previousForwarder, address indexed newForwarder);
  event ExpectedAuthorUpdated(address indexed previousAuthor, address indexed newAuthor);
  event ExpectedWorkflowIdUpdated(bytes32 indexed previousId, bytes32 indexed newId);
  event ExpectedWorkflowNameUpdated(bytes10 indexed previousName, bytes10 indexed newName);
  event SecurityWarning(string message);

  function setUp() public {
    receiver = new MockReceiver(forwarder, owner);
  }

  function test_constructor_RevertsOnZeroForwarder() public {
    vm.expectRevert(ReceiverTemplate.InvalidForwarderAddress.selector);
    new MockReceiver(address(0), owner);
  }

  function test_constructor_RevertsOnZeroInitialOwner() public {
    vm.expectRevert(ReceiverTemplate.InvalidInitialOwner.selector);
    new MockReceiver(forwarder, address(0));
  }

  function test_constructor_SetsForwarderAndOwner() public {
    assertEq(receiver.getForwarderAddress(), forwarder);
    assertEq(receiver.owner(), owner);
  }

  function test_constructor_OwnerEqualsMsgSenderDoesNotTransfer() public {
    vm.prank(owner);
    MockReceiver r = new MockReceiver(forwarder, owner);
    assertEq(r.owner(), owner);
  }

  function test_onReport_RevertsIfSenderNotForwarder() public {
    vm.expectRevert(
      abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, stranger, forwarder)
    );
    vm.prank(stranger);
    receiver.onReport('', hex'1234');
  }

  function test_onReport_SuccessIfSenderIsForwarder() public {
    vm.prank(forwarder);
    receiver.onReport('', hex'cafe');
    assertEq(receiver.lastReport(), hex'cafe');
  }

  function test_onReport_NoMetadataChecksWhenAllUnset() public {
    vm.prank(forwarder);
    receiver.onReport(hex'00', hex'01');
    assertEq(receiver.lastReport(), hex'01');
  }

  function test_onReport_RevertsOnWorkflowIdMismatch() public {
    vm.prank(owner);
    receiver.setExpectedWorkflowId(WORKFLOW_ID);

    bytes32 wrongId = bytes32(uint256(0xfeed));
    bytes memory metadata = _buildMetadata(wrongId, bytes10(0), author);

    vm.expectRevert(
      abi.encodeWithSelector(ReceiverTemplate.InvalidWorkflowId.selector, wrongId, WORKFLOW_ID)
    );
    vm.prank(forwarder);
    receiver.onReport(metadata, hex'01');
  }

  function test_onReport_RevertsOnAuthorMismatch() public {
    vm.prank(owner);
    receiver.setExpectedAuthor(author);

    address wrongAuthor = makeAddr('wrongAuthor');
    bytes memory metadata = _buildMetadata(WORKFLOW_ID, bytes10(0), wrongAuthor);

    vm.expectRevert(
      abi.encodeWithSelector(ReceiverTemplate.InvalidAuthor.selector, wrongAuthor, author)
    );
    vm.prank(forwarder);
    receiver.onReport(metadata, hex'01');
  }

  function test_onReport_PassesWhenWorkflowIdAndAuthorMatch() public {
    vm.startPrank(owner);
    receiver.setExpectedWorkflowId(WORKFLOW_ID);
    receiver.setExpectedAuthor(author);
    vm.stopPrank();

    bytes memory metadata = _buildMetadata(WORKFLOW_ID, bytes10(0), author);
    vm.prank(forwarder);
    receiver.onReport(metadata, hex'abcd');
    assertEq(receiver.lastReport(), hex'abcd');
  }

  function test_onReport_RevertsIfWorkflowNameSetButAuthorUnset() public {
    vm.prank(owner);
    receiver.setExpectedWorkflowName('myflow');

    bytes memory metadata = _buildMetadata(bytes32(0), bytes10(0), address(0));

    vm.expectRevert(ReceiverTemplate.WorkflowNameRequiresAuthorValidation.selector);
    vm.prank(forwarder);
    receiver.onReport(metadata, hex'01');
  }

  function test_setForwarderAddress_OnlyOwner() public {
    vm.expectRevert(NOT_OWNER_REVERT);
    vm.prank(stranger);
    receiver.setForwarderAddress(makeAddr('newForwarder'));
  }

  function test_setForwarderAddress_UpdatesAndEmits() public {
    address newForwarder = makeAddr('newForwarder');
    vm.expectEmit(true, true, false, false);
    emit ForwarderAddressUpdated(forwarder, newForwarder);
    vm.prank(owner);
    receiver.setForwarderAddress(newForwarder);
    assertEq(receiver.getForwarderAddress(), newForwarder);
  }

  function test_setForwarderAddress_ZeroEmitsSecurityWarning() public {
    vm.expectEmit(false, false, false, true);
    emit SecurityWarning('Forwarder address set to zero - contract is now INSECURE');
    vm.prank(owner);
    receiver.setForwarderAddress(address(0));
    assertEq(receiver.getForwarderAddress(), address(0));
  }

  function test_setExpectedAuthor_OnlyOwner() public {
    vm.expectRevert(NOT_OWNER_REVERT);
    vm.prank(stranger);
    receiver.setExpectedAuthor(author);
  }

  function test_setExpectedWorkflowId_OnlyOwner() public {
    vm.expectRevert(NOT_OWNER_REVERT);
    vm.prank(stranger);
    receiver.setExpectedWorkflowId(WORKFLOW_ID);
  }

  function test_setExpectedWorkflowName_OnlyOwner() public {
    vm.expectRevert(NOT_OWNER_REVERT);
    vm.prank(stranger);
    receiver.setExpectedWorkflowName('foo');
  }

  function test_setExpectedWorkflowName_EmptyStringResetsToZero() public {
    vm.startPrank(owner);
    receiver.setExpectedWorkflowName('foo');
    assertTrue(receiver.getExpectedWorkflowName() != bytes10(0));
    receiver.setExpectedWorkflowName('');
    vm.stopPrank();
    assertEq(receiver.getExpectedWorkflowName(), bytes10(0));
  }

  function test_supportsInterface_IReceiverAndIERC165() public {
    assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId));
    assertTrue(receiver.supportsInterface(type(IERC165).interfaceId));
    assertFalse(receiver.supportsInterface(bytes4(0xdeadbeef)));
  }

  // Layout consumed by _decodeMetadata: workflowId | workflowName | workflowOwner.
  function _buildMetadata(
    bytes32 workflowId,
    bytes10 workflowName,
    address workflowOwner
  ) internal pure returns (bytes memory) {
    return abi.encodePacked(workflowId, workflowName, workflowOwner);
  }
}

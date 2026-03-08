// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice デポジット（hold/capture/release）用の最小実装。
///         - hold: ユーザーからVaultへ転送し、内部残高に積む
///         - capture: オペレータが内部残高を任意の受取先へ支払う
///         - release: オペレータが内部残高をユーザーへ返す
contract DepositVault is Ownable {
    IERC20 public immutable token;
    address public operator;

    mapping(address => uint256) public heldBalance;

    error NotOperator();
    error ZeroAddress();
    error InsufficientHeld();

    event OperatorUpdated(address indexed operator);
    event DepositHeld(address indexed payer, uint256 amount);
    event DepositCaptured(address indexed payer, address indexed to, uint256 amount);
    event DepositReleased(address indexed payer, uint256 amount);

    constructor(address token_) Ownable(msg.sender) {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function holdDeposit(uint256 amount) external {
        require(amount > 0, "amount=0");
        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "transferFrom failed");
        heldBalance[msg.sender] += amount;
        emit DepositHeld(msg.sender, amount);
    }

    function captureDeposit(address payer, address to, uint256 amount) external {
        if (msg.sender != operator) revert NotOperator();
        if (to == address(0)) revert ZeroAddress();
        if (heldBalance[payer] < amount) revert InsufficientHeld();

        heldBalance[payer] -= amount;
        bool ok = token.transfer(to, amount);
        require(ok, "transfer failed");
        emit DepositCaptured(payer, to, amount);
    }

    function releaseDeposit(address payer, uint256 amount) external {
        if (msg.sender != operator) revert NotOperator();
        if (heldBalance[payer] < amount) revert InsufficientHeld();

        heldBalance[payer] -= amount;
        bool ok = token.transfer(payer, amount);
        require(ok, "transfer failed");
        emit DepositReleased(payer, amount);
    }
}

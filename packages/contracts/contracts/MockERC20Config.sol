// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice transfer/transferFrom が false を返すケースを作るためのテスト用トークン
contract MockERC20Config is IERC20 {
    string public constant name = "Mock JPYC Config";
    string public constant symbol = "mJPYCC";
    uint8 public constant decimals = 18;

    bool public transferReturns = true;
    bool public transferFromReturns = true;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balanceOf;
    mapping(address => mapping(address => uint256)) private _allowance;

    function setTransferReturns(bool v) external {
        transferReturns = v;
    }

    function setTransferFromReturns(bool v) external {
        transferFromReturns = v;
    }

    function mint(address to, uint256 amount) external {
        _totalSupply += amount;
        _balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balanceOf[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowance[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (!transferReturns) return false;
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (!transferFromReturns) return false;
        uint256 allowed = _allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        _allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to=0");
        uint256 bal = _balanceOf[from];
        require(bal >= amount, "balance");
        _balanceOf[from] = bal - amount;
        _balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}


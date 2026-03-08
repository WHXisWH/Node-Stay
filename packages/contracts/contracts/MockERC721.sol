// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title テスト用シンプル ERC-721
/// @notice マーケットプレイステスト向けの転送制限なし ERC-721
contract MockERC721 is ERC721 {
    uint256 public nextTokenId = 1;

    constructor() ERC721("Mock Usage Right", "mNSUR") {}

    /// @notice テスト用にトークンをミントする
    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _mint(to, tokenId);
    }
}

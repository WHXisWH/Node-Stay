// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NodeStay 二次市場コントラクト
/// @notice 使用権NFT（UsageRight ERC-721）を出品・キャンセル・購入する二次市場
/// @dev JPYC（円建てステーブルコイン）で決済し、プラットフォーム手数料を自動控除する
///      NFTはエスクローとして本コントラクトが一時保管する
contract NodeStayMarketplace is Ownable, ReentrancyGuard {

    // -----------------------------------------------------------------------
    // 定数
    // -----------------------------------------------------------------------

    /// @notice 転送クールダウン期間（24時間）
    /// @dev 購入後 24 時間以内の再出品を禁止する
    uint256 public constant TRANSFER_COOLDOWN = 24 hours;

    /// @notice 手数料計算の分母（10000 = 100%）
    uint256 public constant FEE_DENOMINATOR = 10000;

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice 決済トークン（JPYC）
    IERC20 public immutable jpyc;

    /// @notice 使用権NFTコントラクト
    IERC721 public immutable usageRight;

    /// @notice プラットフォーム手数料受取アドレス
    address public platformFeeRecipient;

    /// @notice プラットフォーム手数料率（BPS、初期値 250 = 2.5%）
    uint256 public platformFeeBps = 250;

    /// @notice 次の出品ID（1始まり）
    uint256 public nextListingId = 1;

    /// @notice listingId → 出品情報
    mapping(uint256 => Listing) public listings;

    /// @notice tokenId → 最終転送タイムスタンプ
    mapping(uint256 => uint256) public lastTransferAt;

    // -----------------------------------------------------------------------
    // 構造体
    // -----------------------------------------------------------------------

    /// @notice 出品情報
    struct Listing {
        uint256 listingId;      // 出品ID
        uint256 tokenId;        // ERC-721 トークンID
        address seller;         // 出品者アドレス
        uint256 priceJpyc;      // 価格（JPYC、18 decimals）
        uint256 listedAt;       // 出品日時（block.timestamp）
        bool    active;         // 有効フラグ
    }

    // -----------------------------------------------------------------------
    // イベント
    // -----------------------------------------------------------------------

    /// @notice NFT 出品時に発行される
    event Listed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 priceJpyc
    );

    /// @notice 出品キャンセル時に発行される
    event Cancelled(
        uint256 indexed listingId,
        address indexed seller
    );

    /// @notice 購入完了時に発行される
    event Purchased(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 priceJpyc
    );

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error ZeroPrice();
    error NotTokenOwner();
    error CooldownNotElapsed();
    error NotSeller();
    error ListingNotActive();
    error SellerCannotBuy();
    error FeeTooHigh();

    // -----------------------------------------------------------------------
    // コンストラクタ
    // -----------------------------------------------------------------------

    /// @notice コントラクトを初期化する
    /// @param _jpyc               JPYC トークンアドレス
    /// @param _usageRight         使用権NFTコントラクトアドレス
    /// @param _platformFeeRecipient プラットフォーム手数料受取アドレス
    constructor(
        address _jpyc,
        address _usageRight,
        address _platformFeeRecipient
    ) Ownable(msg.sender) {
        if (_jpyc == address(0)) revert ZeroAddress();
        if (_usageRight == address(0)) revert ZeroAddress();
        if (_platformFeeRecipient == address(0)) revert ZeroAddress();

        jpyc = IERC20(_jpyc);
        usageRight = IERC721(_usageRight);
        platformFeeRecipient = _platformFeeRecipient;
    }

    // -----------------------------------------------------------------------
    // 出品関数
    // -----------------------------------------------------------------------

    /// @notice 使用権NFTを二次市場に出品する
    /// @dev 呼び出し前に `usageRight.approve(marketplace, tokenId)` が必要
    ///      購入後 24 時間以内のトークンは再出品できない
    /// @param tokenId    出品するトークンID
    /// @param priceJpyc  希望売却価格（JPYC、18 decimals）
    /// @return listingId 発行された出品ID
    function createListing(uint256 tokenId, uint256 priceJpyc)
        external
        returns (uint256 listingId)
    {
        // 呼び出し者がトークンオーナーであることを確認
        if (usageRight.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        // 価格が 0 より大きいことを確認
        if (priceJpyc == 0) revert ZeroPrice();

        // 24 時間クールダウンを確認（初回は lastTransferAt == 0 なので OK）
        uint256 last = lastTransferAt[tokenId];
        if (last != 0 && block.timestamp < last + TRANSFER_COOLDOWN) {
            revert CooldownNotElapsed();
        }

        // NFT をエスクロー（本コントラクト）へ転送
        usageRight.transferFrom(msg.sender, address(this), tokenId);

        // 出品情報を記録
        listingId = nextListingId++;
        listings[listingId] = Listing({
            listingId: listingId,
            tokenId:   tokenId,
            seller:    msg.sender,
            priceJpyc: priceJpyc,
            listedAt:  block.timestamp,
            active:    true
        });

        emit Listed(listingId, tokenId, msg.sender, priceJpyc);
    }

    // -----------------------------------------------------------------------
    // キャンセル関数
    // -----------------------------------------------------------------------

    /// @notice 出品をキャンセルし、NFTを出品者に返却する
    /// @param listingId キャンセルする出品ID
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];

        // 出品者本人のみキャンセル可能
        if (listing.seller != msg.sender) revert NotSeller();

        // 有効な出品のみキャンセル可能
        if (!listing.active) revert ListingNotActive();

        // 出品を無効化
        listing.active = false;

        // NFT を出品者へ返却
        usageRight.transferFrom(address(this), msg.sender, listing.tokenId);

        emit Cancelled(listingId, msg.sender);
    }

    // -----------------------------------------------------------------------
    // 購入関数
    // -----------------------------------------------------------------------

    /// @notice 出品中の使用権NFTを購入する
    /// @dev 呼び出し前に `jpyc.approve(marketplace, priceJpyc)` が必要
    ///      リエントランシー対策として nonReentrant を適用
    /// @param listingId 購入する出品ID
    function buyListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        // 有効な出品のみ購入可能
        if (!listing.active) revert ListingNotActive();

        // 出品者は自分の出品を購入できない
        if (msg.sender == listing.seller) revert SellerCannotBuy();

        uint256 priceJpyc = listing.priceJpyc;
        address seller    = listing.seller;
        uint256 tokenId   = listing.tokenId;

        // 手数料と出品者受取額を計算
        uint256 fee          = priceJpyc * platformFeeBps / FEE_DENOMINATOR;
        uint256 sellerAmount = priceJpyc - fee;

        // 出品を無効化（リエントランシー対策：状態変更を先に行う）
        listing.active = false;

        // 購入者から JPYC を受け取る
        jpyc.transferFrom(msg.sender, address(this), priceJpyc);

        // 出品者へ売却額を送金
        jpyc.transfer(seller, sellerAmount);

        // プラットフォームへ手数料を送金
        jpyc.transfer(platformFeeRecipient, fee);

        // NFT を購入者へ転送
        usageRight.transferFrom(address(this), msg.sender, tokenId);

        // 転送タイムスタンプを更新（24 時間クールダウン開始）
        lastTransferAt[tokenId] = block.timestamp;

        emit Purchased(listingId, tokenId, msg.sender, priceJpyc);
    }

    // -----------------------------------------------------------------------
    // 管理関数（Owner）
    // -----------------------------------------------------------------------

    /// @notice プラットフォーム手数料率を更新する
    /// @dev 最大 10%（1000 BPS）まで設定可能
    /// @param newFeeBps 新しい手数料率（BPS）
    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert FeeTooHigh();
        platformFeeBps = newFeeBps;
    }

    /// @notice プラットフォーム手数料受取アドレスを更新する
    /// @param newRecipient 新しい受取アドレス
    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        platformFeeRecipient = newRecipient;
    }
}

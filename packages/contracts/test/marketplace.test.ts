import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('NodeStayMarketplace', () => {
  // -----------------------------------------------------------------------
  // デプロイヘルパー
  // -----------------------------------------------------------------------

  async function deploy() {
    const [owner, seller, buyer, platform, other] = await ethers.getSigners();

    // モック JPYC トークン
    const Token = await ethers.getContractFactory('MockERC20');
    const jpyc = await Token.deploy();

    // モック UsageRight NFT（転送制限なし）
    const NFT = await ethers.getContractFactory('MockERC721');
    const nft = await NFT.deploy();

    // マーケットプレイスをデプロイ
    const Marketplace = await ethers.getContractFactory('NodeStayMarketplace');
    const marketplace = await Marketplace.deploy(
      await jpyc.getAddress(),
      await nft.getAddress(),
      platform.address
    );

    // seller に NFT をミントし、marketplace への approve を設定
    const mintTx = await nft.mint(seller.address);
    const receipt = await mintTx.wait();
    // tokenId = 1（最初のミント）
    const tokenId = 1n;

    return { marketplace, jpyc, nft, owner, seller, buyer, platform, other, tokenId };
  }

  // -----------------------------------------------------------------------
  // createListing — 出品
  // -----------------------------------------------------------------------

  it('出品者がトークンを出品できる（NFT はエスクローに保管、イベント発行）', async () => {
    const { marketplace, nft, seller, tokenId } = await deploy();

    const price = ethers.parseEther('100'); // 100 JPYC

    // marketplace への approve
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);

    await expect(
      marketplace.connect(seller).createListing(tokenId, price)
    )
      .to.emit(marketplace, 'Listed')
      .withArgs(1n, tokenId, seller.address, price);

    // NFT はエスクロー（コントラクト）に保管されている
    expect(await nft.ownerOf(tokenId)).to.equal(await marketplace.getAddress());

    // 出品情報が正しく記録されている
    const listing = await marketplace.listings(1n);
    expect(listing.listingId).to.equal(1n);
    expect(listing.tokenId).to.equal(tokenId);
    expect(listing.seller).to.equal(seller.address);
    expect(listing.priceJpyc).to.equal(price);
    expect(listing.active).to.be.true;

    // 次の出品ID がインクリメントされている
    expect(await marketplace.nextListingId()).to.equal(2n);
  });

  it('トークンオーナー以外は出品できない（NotTokenOwner）', async () => {
    const { marketplace, nft, other, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    await expect(
      marketplace.connect(other).createListing(tokenId, price)
    ).to.be.revertedWithCustomError(marketplace, 'NotTokenOwner');
  });

  it('価格 0 での出品は失敗する（ZeroPrice）', async () => {
    const { marketplace, nft, seller, tokenId } = await deploy();
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);

    await expect(
      marketplace.connect(seller).createListing(tokenId, 0n)
    ).to.be.revertedWithCustomError(marketplace, 'ZeroPrice');
  });

  // -----------------------------------------------------------------------
  // cancelListing — キャンセル
  // -----------------------------------------------------------------------

  it('出品者がキャンセルすると NFT が返却され active = false になる', async () => {
    const { marketplace, nft, seller, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    await expect(
      marketplace.connect(seller).cancelListing(1n)
    )
      .to.emit(marketplace, 'Cancelled')
      .withArgs(1n, seller.address);

    // NFT が出品者に返却されている
    expect(await nft.ownerOf(tokenId)).to.equal(seller.address);

    // 出品が無効化されている
    const listing = await marketplace.listings(1n);
    expect(listing.active).to.be.false;
  });

  it('出品者以外はキャンセルできない（NotSeller）', async () => {
    const { marketplace, nft, seller, other, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    await expect(
      marketplace.connect(other).cancelListing(1n)
    ).to.be.revertedWithCustomError(marketplace, 'NotSeller');
  });

  it('非アクティブな出品のキャンセルは失敗する（ListingNotActive）', async () => {
    const { marketplace, nft, seller, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    // 一度キャンセル
    await marketplace.connect(seller).cancelListing(1n);

    // 再度キャンセルは失敗する
    await expect(
      marketplace.connect(seller).cancelListing(1n)
    ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
  });

  // -----------------------------------------------------------------------
  // buyListing — 購入・手数料分配
  // -----------------------------------------------------------------------

  it('購入者が支払い、NFT が転送され、手数料が正しく分配される（2.5%）', async () => {
    const { marketplace, jpyc, nft, seller, buyer, platform, tokenId } = await deploy();
    const price = ethers.parseEther('1000'); // 1000 JPYC

    // 出品
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    // 購入者に JPYC を付与し approve
    await jpyc.mint(buyer.address, price);
    await jpyc.connect(buyer).approve(await marketplace.getAddress(), price);

    const sellerBefore   = await jpyc.balanceOf(seller.address);
    const platformBefore = await jpyc.balanceOf(platform.address);

    await expect(
      marketplace.connect(buyer).buyListing(1n)
    )
      .to.emit(marketplace, 'Purchased')
      .withArgs(1n, tokenId, buyer.address, price);

    // NFT が購入者に転送されている
    expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);

    // 手数料計算：2.5% = 1000 * 250 / 10000 = 25 JPYC
    const fee          = 25n * 10n ** 18n;  // 25 JPYC
    const sellerAmount = price - fee;       // 975 JPYC

    // 出品者受取額を確認
    expect(await jpyc.balanceOf(seller.address)).to.equal(sellerBefore + sellerAmount);

    // プラットフォーム手数料受取を確認
    expect(await jpyc.balanceOf(platform.address)).to.equal(platformBefore + fee);

    // 出品が無効化されている
    const listing = await marketplace.listings(1n);
    expect(listing.active).to.be.false;

    // lastTransferAt が更新されている
    const now = BigInt(await time.latest());
    expect(await marketplace.lastTransferAt(tokenId)).to.be.closeTo(now, 5n);
  });

  it('非アクティブな出品の購入は失敗する（ListingNotActive）', async () => {
    const { marketplace, nft, seller, buyer, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    // キャンセルで無効化
    await marketplace.connect(seller).cancelListing(1n);

    await expect(
      marketplace.connect(buyer).buyListing(1n)
    ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
  });

  it('出品者は自分の出品を購入できない（SellerCannotBuy）', async () => {
    const { marketplace, nft, seller, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    await expect(
      marketplace.connect(seller).buyListing(1n)
    ).to.be.revertedWithCustomError(marketplace, 'SellerCannotBuy');
  });

  // -----------------------------------------------------------------------
  // 24 時間クールダウン
  // -----------------------------------------------------------------------

  it('購入後 24 時間以内に再出品しようとすると失敗する（CooldownNotElapsed）', async () => {
    const { marketplace, jpyc, nft, seller, buyer, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    // 出品して購入完了
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    await jpyc.mint(buyer.address, price);
    await jpyc.connect(buyer).approve(await marketplace.getAddress(), price);
    await marketplace.connect(buyer).buyListing(1n);

    // 購入者が NFT を保有している（buyer = 新しい所有者）
    expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);

    // 24 時間未満（12 時間後）に再出品を試みる
    await time.increase(12 * 60 * 60); // 12 時間経過

    await nft.connect(buyer).approve(await marketplace.getAddress(), tokenId);

    await expect(
      marketplace.connect(buyer).createListing(tokenId, price)
    ).to.be.revertedWithCustomError(marketplace, 'CooldownNotElapsed');
  });

  it('24 時間クールダウン後は再出品できる', async () => {
    const { marketplace, jpyc, nft, seller, buyer, tokenId } = await deploy();
    const price = ethers.parseEther('100');

    // 出品して購入完了
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).createListing(tokenId, price);

    await jpyc.mint(buyer.address, price);
    await jpyc.connect(buyer).approve(await marketplace.getAddress(), price);
    await marketplace.connect(buyer).buyListing(1n);

    // 24 時間 + 1 秒経過
    await time.increase(24 * 60 * 60 + 1);

    // 再出品が成功する
    await nft.connect(buyer).approve(await marketplace.getAddress(), tokenId);

    await expect(
      marketplace.connect(buyer).createListing(tokenId, price)
    ).to.emit(marketplace, 'Listed');
  });

  // -----------------------------------------------------------------------
  // setPlatformFee — 手数料率設定
  // -----------------------------------------------------------------------

  it('Owner が手数料率を更新できる', async () => {
    const { marketplace, owner } = await deploy();

    await marketplace.connect(owner).setPlatformFee(500n); // 5%
    expect(await marketplace.platformFeeBps()).to.equal(500n);
  });

  it('手数料率が 1000 BPS (10%) を超えると失敗する（FeeTooHigh）', async () => {
    const { marketplace, owner } = await deploy();

    await expect(
      marketplace.connect(owner).setPlatformFee(1001n)
    ).to.be.revertedWithCustomError(marketplace, 'FeeTooHigh');
  });

  it('Owner 以外は手数料率を変更できない（OwnableUnauthorizedAccount）', async () => {
    const { marketplace, other } = await deploy();

    await expect(
      marketplace.connect(other).setPlatformFee(100n)
    ).to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount');
  });

  // -----------------------------------------------------------------------
  // setPlatformFeeRecipient — 受取アドレス設定
  // -----------------------------------------------------------------------

  it('Owner が手数料受取アドレスを更新できる', async () => {
    const { marketplace, owner, other } = await deploy();

    await marketplace.connect(owner).setPlatformFeeRecipient(other.address);
    expect(await marketplace.platformFeeRecipient()).to.equal(other.address);
  });

  it('ゼロアドレスの受取アドレスは失敗する（ZeroAddress）', async () => {
    const { marketplace, owner } = await deploy();

    await expect(
      marketplace.connect(owner).setPlatformFeeRecipient(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(marketplace, 'ZeroAddress');
  });

  // -----------------------------------------------------------------------
  // コンストラクタ検証
  // -----------------------------------------------------------------------

  it('ゼロアドレスの JPYC でデプロイは失敗する（ZeroAddress）', async () => {
    const [, , , platform] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory('MockERC721');
    const nft = await NFT.deploy();
    const Marketplace = await ethers.getContractFactory('NodeStayMarketplace');

    await expect(
      Marketplace.deploy(ethers.ZeroAddress, await nft.getAddress(), platform.address)
    ).to.be.revertedWithCustomError(Marketplace, 'ZeroAddress');
  });

  it('ゼロアドレスの usageRight でデプロイは失敗する（ZeroAddress）', async () => {
    const [, , , platform] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockERC20');
    const jpyc = await Token.deploy();
    const Marketplace = await ethers.getContractFactory('NodeStayMarketplace');

    await expect(
      Marketplace.deploy(await jpyc.getAddress(), ethers.ZeroAddress, platform.address)
    ).to.be.revertedWithCustomError(Marketplace, 'ZeroAddress');
  });

  it('ゼロアドレスの platformFeeRecipient でデプロイは失敗する（ZeroAddress）', async () => {
    const Token = await ethers.getContractFactory('MockERC20');
    const jpyc = await Token.deploy();
    const NFT = await ethers.getContractFactory('MockERC721');
    const nft = await NFT.deploy();
    const Marketplace = await ethers.getContractFactory('NodeStayMarketplace');

    await expect(
      Marketplace.deploy(await jpyc.getAddress(), await nft.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(Marketplace, 'ZeroAddress');
  });
});

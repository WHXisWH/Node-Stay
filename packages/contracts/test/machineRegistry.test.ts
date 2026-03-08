import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('NodeStayMachineRegistry', () => {
  async function deploy() {
    const [owner, operator, other, merchant] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('NodeStayMachineRegistry');
    const registry = await Registry.deploy();
    await registry.setOperator(operator.address);

    const venueIdHash = ethers.keccak256(ethers.toUtf8Bytes('venue-001'));
    const specHash    = ethers.keccak256(ethers.toUtf8Bytes('RTX3060-spec'));

    return { registry, owner, operator, other, merchant, venueIdHash, specHash };
  }

  // -----------------------------------------------------------------------
  // 機器登録
  // -----------------------------------------------------------------------

  it('オペレータが機器を登録できる', async () => {
    const { registry, operator, venueIdHash, specHash } = await deploy();

    const tx = await registry.connect(operator).registerMachine(
      venueIdHash, 1 /* GPU */, specHash, 'ipfs://machine-meta'
    );
    const receipt = await tx.wait();

    // MachineRegistered イベントが発行されること
    const event = receipt!.logs
      .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'MachineRegistered');

    expect(event).to.not.be.undefined;
    const machineId = event!.args.machineId as string;

    // オンチェーンに保存されていること
    expect(await registry.exists(machineId)).to.be.true;

    const data = await registry.getMachine(machineId);
    expect(data.venueIdHash).to.equal(venueIdHash);
    expect(data.machineClass).to.equal(1);
    expect(data.specHash).to.equal(specHash);
    expect(data.status).to.equal(0); // REGISTERED
  });

  it('同じパラメータで複数登録するとノンスで異なる machineId になる', async () => {
    const { registry, operator, venueIdHash, specHash } = await deploy();

    const tx1 = await registry.connect(operator).registerMachine(venueIdHash, 1, specHash, 'uri1');
    const tx2 = await registry.connect(operator).registerMachine(venueIdHash, 1, specHash, 'uri2');

    const r1 = await tx1.wait();
    const r2 = await tx2.wait();

    const parseEvent = (receipt: any) =>
      receipt.logs
        .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === 'MachineRegistered');

    const id1 = parseEvent(r1)!.args.machineId as string;
    const id2 = parseEvent(r2)!.args.machineId as string;

    expect(id1).to.not.equal(id2);
  });

  it('オペレータ以外は登録できない', async () => {
    const { registry, other, venueIdHash, specHash } = await deploy();
    await expect(
      registry.connect(other).registerMachine(venueIdHash, 1, specHash, 'uri')
    ).to.be.revertedWithCustomError(registry, 'NotOperator');
  });

  // -----------------------------------------------------------------------
  // 状態更新
  // -----------------------------------------------------------------------

  it('オペレータが機器状態を更新できる', async () => {
    const { registry, operator, venueIdHash, specHash } = await deploy();
    const tx = await registry.connect(operator).registerMachine(venueIdHash, 0, specHash, 'uri');
    const r  = await tx.wait();
    const machineId = r!.logs
      .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'MachineRegistered')!.args.machineId;

    // REGISTERED → ACTIVE
    await expect(
      registry.connect(operator).updateMachineStatus(machineId, 1 /* ACTIVE */)
    ).to.emit(registry, 'MachineStatusUpdated').withArgs(machineId, 1);

    const data = await registry.getMachine(machineId);
    expect(data.status).to.equal(1);
  });

  it('存在しない machineId の状態更新は失敗する', async () => {
    const { registry, operator } = await deploy();
    const fakeId = ethers.keccak256(ethers.toUtf8Bytes('fake'));
    await expect(
      registry.connect(operator).updateMachineStatus(fakeId, 1)
    ).to.be.revertedWithCustomError(registry, 'MachineNotFound');
  });

  // -----------------------------------------------------------------------
  // メタデータ更新
  // -----------------------------------------------------------------------

  it('オペレータがメタデータ URI を更新できる', async () => {
    const { registry, operator, venueIdHash, specHash } = await deploy();
    const tx = await registry.connect(operator).registerMachine(venueIdHash, 0, specHash, 'old-uri');
    const r  = await tx.wait();
    const machineId = r!.logs
      .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'MachineRegistered')!.args.machineId;

    await expect(
      registry.connect(operator).updateMachineMetadata(machineId, 'new-uri')
    ).to.emit(registry, 'MachineMetadataUpdated').withArgs(machineId, 'new-uri');

    const data = await registry.getMachine(machineId);
    expect(data.metadataURI).to.equal('new-uri');
  });

  // -----------------------------------------------------------------------
  // 所有権移転
  // -----------------------------------------------------------------------

  it('オペレータが機器ルートを移転できる', async () => {
    const { registry, operator, merchant, venueIdHash, specHash } = await deploy();
    const tx = await registry.connect(operator).registerMachine(venueIdHash, 1, specHash, 'uri');
    const r  = await tx.wait();
    const machineId = r!.logs
      .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'MachineRegistered')!.args.machineId;

    await expect(
      registry.connect(operator).transferMachineRoot(machineId, merchant.address)
    ).to.emit(registry, 'MachineOwnerUpdated').withArgs(machineId, merchant.address);

    const data = await registry.getMachine(machineId);
    expect(data.owner).to.equal(merchant.address);
  });

  it('ゼロアドレスへの移転は失敗する', async () => {
    const { registry, operator, venueIdHash, specHash } = await deploy();
    const tx = await registry.connect(operator).registerMachine(venueIdHash, 1, specHash, 'uri');
    const r  = await tx.wait();
    const machineId = r!.logs
      .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'MachineRegistered')!.args.machineId;

    await expect(
      registry.connect(operator).transferMachineRoot(machineId, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(registry, 'ZeroAddress');
  });

  // -----------------------------------------------------------------------
  // アクセス制御
  // -----------------------------------------------------------------------

  it('オペレータ設定：ゼロアドレスは失敗する', async () => {
    const { registry } = await deploy();
    await expect(registry.setOperator(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(registry, 'ZeroAddress');
  });

  it('Owner 以外はオペレータを設定できない', async () => {
    const { registry, other } = await deploy();
    await expect(registry.connect(other).setOperator(other.address))
      .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
  });

  // -----------------------------------------------------------------------
  // ERC-721 通常転送の禁止
  // -----------------------------------------------------------------------

  it('非オペレータによる ERC-721 転送（safeTransferFrom）は禁止される', async () => {
    const { registry, operator, other, venueIdHash, specHash } = await deploy();
    const tx = await registry.connect(operator).registerMachine(venueIdHash, 1, specHash, 'uri');
    const r  = await tx.wait();
    const machineId = r!.logs
      .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'MachineRegistered')!.args.machineId;

    // tokenId を取得
    const tokenId = await registry.getTokenIdByMachine(machineId);

    // 非オペレータ（owner が operator に承認してないユーザー）の転送は拒否
    await expect(
      registry.connect(other)['safeTransferFrom(address,address,uint256)'](
        operator.address, other.address, tokenId
      )
    ).to.be.revertedWithCustomError(registry, 'NotOperator');
  });
});

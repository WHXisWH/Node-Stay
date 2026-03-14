# NodeStay 问题总整理（更新于 2026-03-14）

> 本文是当前最新状态：已定位根因、已完成修复、当前可用性、剩余风险与后续执行顺序。

## 1. 已定位问题与结论

### 1.1 NFT 显示由 0x0 发放
- 结论：不是 bug。
- 根因：ERC-721 mint 事件标准就是 `Transfer(from=0x0, to=用户)`。

### 1.2 购买成功后 Toast 狂刷
- 根因：成功状态复位与 effect 依赖设计问题（含 toast context 引用变化导致重复触发）。
- 状态：已定位，代码有改动；需线上再验收“单次购买只弹一次”。

### 1.3 出品失败 / Job 预约失败（`Connector not connected`）
- 根因：部分 SNS 登录写链路径仍走 wagmi connector，而非 AA。
- 状态：已定位，仍属待完成项。

### 1.4 机器“上链未注册”、链上/库状态不一致
- 根因：machineId 规则不一致，监听回写匹配失败。
- 状态：已定位，仍属待完成项（P0/P1）。

### 1.5 后端 `eth_getFilterChanges -> filter not found`
- 根因：HTTP provider + filter 轮询在 RPC 回收 filter 后不稳定。
- 状态：已改为区块游标/getLogs 同步策略，需线上持续观察。

### 1.6 商户页“CPU 变 GPU”
- 根因：前端默认取第一个 venue + seed 数据首位偏 GPU。
- 状态：已做部分修正，仍需真实商户数据场景验收。

### 1.7 `UsageSettled` 监听参数顺序风险
- 根因：监听字段映射与合约签名不一致会污染账本。
- 状态：已修正为按位序解析，建议继续补回归测试。

### 1.8 422（商家钱包缺失）
- 根因：merchant `treasuryWallet` 缺失/非法，checkout 缺少可持续回退。
- 状态：已修复（后端 + 前端 + client + 测试）。

### 1.9 checkout 链上 502（本轮新增精准定位）
- 根因已精准确认：`settleUsage` 回滚 selector `0xfb8f41b2`，即 `ERC20InsufficientAllowance`。
- 结论：核心不是 operator 地址错误，而是结算时 payer 对 `Settlement` 的 JPYC 授权不足。
- 状态：已修复（见第 2 节）。

---

## 2. 本轮已完成修复

### 2.1 商家钱包可配置 + 前端同步
- 新增后端接口：
  - `GET /v1/merchant/venues/:venueId/treasury-wallet`
  - `PUT /v1/merchant/venues/:venueId/treasury-wallet`
- 增加地址与权限校验（拒绝零地址、owner 绑定逻辑）。
- 商家 Dashboard 增加“受取ウォレット設定”读写 UI（日文文案）。

### 2.2 checkout 422 基础修复
- `endSession` 中钱包严格校验。
- 商家钱包缺失时回退：
  - `PLATFORM_TREASURY`
  - `PLATFORM_FEE_RECIPIENT`
- 回退命中后自动回写 merchant 钱包（含 `null`/空字符串）。

### 2.3 checkout 502 精准修复（授权不足）
- 后端新增结算前链上预检：读取 `balanceOf/allowance`。
- 不足时返回结构化 `422`，包含：
  - `errorCode=INSUFFICIENT_ALLOWANCE` 或 `INSUFFICIENT_BALANCE`
  - `requiredWei`、`allowanceWei`/`balanceWei`
  - `settlementAddress`
- 前端 checkout 流程新增自动恢复：
  - 捕获 `INSUFFICIENT_ALLOWANCE`
  - 自动 `approve`
  - 自动重试一次 checkout
- API client 增加结构化错误类型 `NodeStayApiError`，避免前端靠字符串解析。

### 2.4 区块链初始化并发缺陷修复
- 修复 `BlockchainService` 初始化抢跑问题：
  - 只有全部校验成功后才暴露 provider/signer。
- `BlockchainListener` destroy 阶段增加 `isEnabled` 保护，避免 provider 未初始化时抛错。

### 2.5 测试补强
- 新增/扩展 `SessionService` 单测，覆盖：
  - 商家钱包回退
  - 无回退时 422
  - 非法 payer 钱包
  - allowance 不足 422
  - balance 不足 422

---

## 3. 当前验证结果

### 3.1 编译
- `@nodestay/api` typecheck：通过。
- `@nodestay/web` typecheck：通过。

### 3.2 测试
- `session.service.spec.ts`：5/5 通过。
- `test/v1.test.ts`：11/11 通过（在 `PGSSLMODE=require` 下）。

### 3.3 当前线上可用性结论（Vercel + Render）
- checkout 这条此前的 `502 allowance` 根因已修复为“可识别 + 可自动恢复”。
- 但“全链路完全可用”仍不能下最终结论，因为还有第 4 节待修项（尤其 SNS 写链分流统一、machineId 一致性）。

---

## 4. 当前仍待完成问题

### 4.1 SNS 登录写链通道统一
- 风险：个别流程仍可能触发 `Connector not connected`。
- 待做：出品/取消出品/compute 支付/revenue claim 全量统一 AA 路径。

### 4.2 machineId 一致性 + 历史回填
- 风险：机器链上状态与数据库仍可能错位。
- 待做：统一规则、补回填脚本、加回归测试。

### 4.3 Toast 狂刷与商户机型展示
- 风险：体验类回归未完成最终线上验收。
- 待做：补前端 E2E 覆盖并在真实账号下回归。

### 4.4 监听器长期稳定性
- 风险：需观察长时运行是否仍有延迟/丢事件。
- 待做：线上 24h 观察 + 指标告警。

---

## 5. 部署环境注意事项

- 本地连接 Render 外网 Postgres 需要 SSL（如 `sslmode=require`）。
- 本地不可使用 Render 内网数据库域名。
- Render API 必配且正确：
  - `AMOY_RPC_URL`
  - `OPERATOR_PRIVATE_KEY`
  - `SETTLEMENT_ADDRESS`
  - `USAGE_RIGHT_ADDRESS`
  - `MACHINE_REGISTRY_ADDRESS`
  - `COMPUTE_RIGHT_ADDRESS`
  - `REVENUE_RIGHT_ADDRESS`
  - `MARKETPLACE_ADDRESS`
  - `JPYC_TOKEN_ADDRESS`
  - `PLATFORM_TREASURY`（建议）
  - `PLATFORM_FEE_RECIPIENT`（建议）

---

## 6. 下一阶段执行顺序（建议）

1. 完成 SNS 写链通道统一（先清掉 `Connector not connected`）。
2. 修 machineId 一致性与历史 backfill。
3. 做前端 E2E（购买/出品/预约/checkout/claim）。
4. 部署后做 24h 稳定性观测（监听延迟、交易失败率、落库失败数）。

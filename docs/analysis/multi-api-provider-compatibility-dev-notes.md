# 多 API / 多模型 开发导航

这份文档用于收敛当前搜索结果，减少重复翻阅代码。

## 当前结论

- `taskRoutes` 已经是路由配置入口。
- `src/utils/model/taskRouting.ts` 是任务路由的单一决策点。
- `src/services/api/client.ts` 负责把 route 结果送入 API client。
- `src/services/api/openaiCompatibleClient.ts` 负责 OpenAI-compatible 运输层。
- `src/utils/model/providerMetadata.ts` 负责 provider 默认 base URL 和 key 环境变量元数据。
- `src/utils/model/model.ts` 和 `src/utils/model/agent.ts` 已开始消费 route 结果。
- `src/utils/model/providerBalancer.ts` 当前仍承接 provider / endpoint 的兼容性回退骨架，但长期 owner 已转向外部网关。

## 已完成

- 主路由已能按 `settings.json.taskRoutes.main` 读取 provider / apiStyle / model / baseUrl。
- `querySource` 已能映射到 route，并进入 route-aware client 创建流程。
- OpenAI-compatible provider 已支持 route provider 作为默认端点/密钥选择依据。
- OpenAI-compatible provider 现在会在同 provider 端点耗尽后，继续按兼容 provider 顺序回退。

## 仍需推进

- 把 provider 默认 baseUrl / apiKey 解析收成共享元数据，避免重复散落。
- 共享元数据已经落到 `providerMetadata.ts`，后续应优先扩这里而不是再复制常量。
- 统一主线程、subagent、frontend、review 的路由 model 解析入口。
- 为多 provider 增加更明确的兼容测试。
- 应用内不再把熔断、权重分配做成长期主能力，后续重点改为外部网关集成与直连模式验证。

## 开发顺序

1. 先看这份文档，再看 `src/utils/model/taskRouting.ts`。
2. 再看 `src/services/api/client.ts` 和 `src/services/api/openaiCompatibleClient.ts`。
3. 只有在要改模型选择逻辑时，再看 `src/utils/model/model.ts` 和 `src/utils/model/agent.ts`。
4. 不要重复从头搜索同一批文件，直接沿着这条链路推进。

## 工具

- `bun run scripts/bun-tools.ts providers` 可以直接查看当前 provider 默认端点和密钥环境变量映射。
- `bun run scripts/bun-tools.ts health [provider]` 可以查看当前 endpoint 健康状态。

## 实施计划

- [多 API 均衡切换计划](/E:/Github/claude-code/docs/plans/2026-04-02-load-balancing-plan.md)（已 superseded，保留为历史背景）
- [Provider Routing And Gateway Boundary ADR](/E:/Github/claude-code/docs/decisions/ADR-2026-04-07-provider-routing-and-gateway-boundary.md)

## 约束

- 不要硬编码模型名。
- 不要把 provider 逻辑散到调用点。
- `provider` 负责 API 家族，`apiStyle` 负责传输形状，`model` 只是用户配置值。
- `baseUrl` 一旦存在，就强制 OpenAI-compatible 传输。

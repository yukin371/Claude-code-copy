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
- `sideQuery` 与 token estimation 已接入 route-aware client，不再默认绕回旧的主 client。
- 状态页已可直接查看非 main 任务路由矩阵，便于核对 `subagent` / `frontend` / `review` 等任务实际落点。
- route diagnostics / smoke 现已补代表性的 helper `querySource` 样本，包括 `session_search`、`permission_explainer`、`model_validation`、`side_question`、`auto_mode`、`memdir_relevance`、`hook_prompt`、`chrome_mcp`。
- 带 `querySource` 的 token estimation 调用现已优先跟随 Anthropic 路由任务（例如 `agent:builtin:plan`），避免这些辅助路径继续一律硬绑 `main`；OpenAI-compatible 路由暂仍保守回落到 `main` 计数路径。
- MCP tool 结果的大输出截断链路现已透传调用侧 `querySource`，例如 `chrome_mcp` 这类 helper 路径在进入 token estimation 时不再丢失来源信息。
- ToolSearch 的 auto-threshold 计算现已在 `query` / `compact` / context analysis 等带来源上下文的调用面透传 `querySource`，避免 deferred-tools 计数在这些辅助路径里继续无来源运行。
- SDK `get_context_usage` / 非交互 context analysis 路径现已显式标记为 `sdk`，不再以无来源上下文进入 token / tool-search 相关辅助判断。
- Doctor 的 MCP context warning 诊断路径现也使用显式内部 source（`doctor_context_warning`），避免继续以未标记来源进入 MCP tool token 估算。
- ToolSearch deferred-tools token 计数的 memoize key 现已纳入 model / route 维度，不再把不同路由或模型下的阈值判断结果错误复用到同一组工具名上。
- token-count VCR fixture key 现也纳入 `model` / `route` 维度，避免不同 helper 路由在测试或录制环境里继续共用同一份 token 计数缓存。
- 通用 API VCR fixture key 现已支持显式上下文维度；`queryModel*` / `queryHaiku` / `queryWithModel` 会把 `systemPrompt`、`model`、`querySource` 带入键，避免相同 prompt 在不同任务路由下误复用旧响应。
- route diagnostics / status matrix 现已补更多 `queryHaiku` / `queryWithModel` helper source 样本，包括 `mcp_datetime_parse`、`generate_session_title`、`tool_use_summary_generation`、`rename_generate_name`、`feedback`、`agent_creation`、`away_summary`、`teleport_generate_title`。
- 只读 smoke 与 claude-config smoke 现已额外断言 `mcp_datetime_parse` 在全局 Anthropic gateway 模式下继续沿用主路由，不再只覆盖 `sideQuery` 家族 helper。

## 仍需推进

- 把 provider 默认 baseUrl / apiKey 解析收成共享元数据，避免重复散落。
- 共享元数据已经落到 `providerMetadata.ts`，后续应优先扩这里而不是再复制常量。
- 统一主线程、subagent、frontend、review 的路由 model 解析入口。
- 为多 provider 增加更完整的兼容测试，尤其是更多辅助路径与外部 gateway / 直连 provider 的组合验证。
- 应用内不再把熔断、权重分配做成长期主能力，后续重点改为外部网关集成与直连模式验证。

## 开发顺序

1. 先看这份文档，再看 `src/utils/model/taskRouting.ts`。
2. 再看 `src/services/api/client.ts` 和 `src/services/api/openaiCompatibleClient.ts`。
3. 只有在要改模型选择逻辑时，再看 `src/utils/model/model.ts` 和 `src/utils/model/agent.ts`。
4. 不要重复从头搜索同一批文件，直接沿着这条链路推进。

## 工具

- `bun run scripts/bun-tools.ts providers` 可以直接查看当前 provider 默认端点和密钥环境变量映射。
- `bun run scripts/bun-tools.ts health [provider]` 可以查看当前 endpoint 健康状态。
- `bun run test:routing` 可以一次性回归 task routing、spawned agent route hint、route helper transport matrix。

## 实施计划

- [多 API 均衡切换计划](/E:/Github/claude-code/docs/plans/2026-04-02-load-balancing-plan.md)（已 superseded，保留为历史背景）
- [Provider Routing And Gateway Boundary ADR](/E:/Github/claude-code/docs/decisions/ADR-2026-04-07-provider-routing-and-gateway-boundary.md)

## 约束

- 不要硬编码模型名。
- 不要把 provider 逻辑散到调用点。
- `provider` 负责 API 家族，`apiStyle` 负责传输形状，`model` 只是用户配置值。
- `baseUrl` 一旦存在，就强制 OpenAI-compatible 传输。

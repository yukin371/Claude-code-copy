# 2026-04-04 Typecheck 交接记录

## 目标

- 将仓库继续往“可稳定运行、可逐步收敛 `bun run typecheck`”推进
- 保留可回退检查点，不做大范围重构
- 避免再次把缺失快照误当成真实删除

## 当前结论

- 根依赖基线已经恢复，`bun install --frozen-lockfile` 可完成
- `bun run typecheck` 已从“大量缺失模块 + 根配置错误”收敛到“局部类型边界 + 少量缺失文件”
- 本轮没有提交新 commit，当前工作树仍是待整理状态

## 已完成事项

### 1. 恢复工程基线

- 从早前 stash 恢复：
  - `package.json`
  - `bun.lock`
  - `.gitignore`
- 补回一批缺失的源码/类型快照，重点是此前大量 `TS2307` 的入口文件
- 恢复并替换为更完整的 `tsconfig.json`，包含 Bun/TSX 所需配置

### 2. 已消除的一批 typecheck 头部问题

- bridge / session 二维码参数：
  - `src/commands/bridge/bridge.tsx`
  - `src/components/BridgeDialog.tsx`
  - 去掉 `qrcode` 类型定义里不接受的 `small` 参数
- 一批 `useAppState(...)` 返回 `unknown` 的局部读取已显式收窄：
  - `src/commands/chrome/chrome.tsx`
  - `src/commands/effort/effort.tsx`
  - `src/commands/fast/fast.tsx`
  - `src/commands/ide/ide.tsx`
  - `src/components/CoordinatorAgentStatus.tsx`
  - `src/components/hooks/HooksConfigMenu.tsx`
  - `src/components/LogoV2/CondensedLogo.tsx`
  - `src/components/LogoV2/LogoV2.tsx`
- 一批编译后恒真/恒假比较已折叠，避免 TS2367 噪声：
  - `src/components/AutoUpdater.tsx`
  - `src/components/DevBar.tsx`
  - `src/components/Feedback.tsx`
  - `src/components/FeedbackSurvey/useMemorySurvey.tsx`
  - `src/components/LogoV2/feedConfigs.tsx`
  - `src/components/LogoV2/LogoV2.tsx`
- 其它已完成的局部修补：
  - `src/types/message.ts`
  - `src/entrypoints/sdk/coreTypes.generated.ts`
  - `src/services/analytics/growthbook.ts`
  - `src/context/overlayContext.tsx`
  - `src/cli/print.ts`
  - `src/commands/branch/branch.ts`
  - `src/cli/handlers/auth.ts`
  - `src/components/ConsoleOAuthFlow.tsx`
  - `src/buddy/CompanionSprite.tsx`
  - `src/buddy/useBuddyNotification.tsx`
  - `src/components/CustomSelect/select.tsx`

## 当前 `bun run typecheck` 头部（本轮最新）

当前错误已经前移到以下几组：

### 1. 组件 props 类型簇

- `src/components/diff/DiffDetailView.tsx`
- `src/components/FileEditToolDiff.tsx`
- `src/components/FileEditToolUseRejectedMessage.tsx`
- `src/components/HighlightedCode.tsx`
- `src/components/HighlightedCode/Fallback.tsx`
- `src/components/Markdown.tsx`

特征：

- 组件 props 在编译产物风格文件中被推成 `{}` / `object` / `unknown`
- 典型报错是 `patch/code/filePath/children` 不存在于 `{}` 或 `object`

### 2. Fullscreen / message content 联合类型

- `src/components/FullscreenLayout.tsx`

特征：

- `MessageContentBlock | string` 没有被先做 `typeof !== 'string'` 收窄

### 3. MCP 视图状态簇

- `src/components/mcp/MCPRemoteServerMenu.tsx`
- `src/components/mcp/MCPSettings.tsx`
- `src/components/mcp/MCPStdioServerMenu.tsx`
- `src/components/mcp/MCPToolListView.tsx`

特征：

- `useAppState(s => s.mcp)` 或相关选择器结果被推成 `unknown`
- 需要像前面几轮一样给 `mcp` / `tools` / `resources` / `clients` 做显式类型断言

### 4. 其它头部阻塞

- `src/components/memory/MemoryFileSelector.tsx`
  - `activeAgents` on `unknown`
- `src/components/MemoryUsageIndicator.tsx`
  - 仍有一处 `"external" === 'ant'` 常量比较
- `src/components/Message.tsx`
  - 缺失模块：
    - `../services/compact/snipProjection.js`
    - `../services/compact/snipCompact.js`
  - 另有 `MessageContent` 联合类型不匹配
- `src/components/MessageRow.tsx`
  - `RenderableMessage` 与更窄消息数组类型不兼容
- `src/components/Messages.tsx`
  - `agentDefinitions` on `{}`
  - 缺失模块 `../tools/SendUserFileTool/prompt.js`
  - 若干消息数组泛型不兼容

## 建议接手顺序

1. 先收掉最前面的组件 props 类型簇
   - 这组局部、纯展示、风险最低
   - 做法大概率是给函数参数和组件别名补明确 props 类型

2. 处理 `FullscreenLayout.tsx`
   - 只需要联合类型收窄，属于小修

3. 处理 MCP 视图状态簇
   - 这组模式很统一，参考本轮已修的：
     - `src/commands/chrome/chrome.tsx`
     - `src/commands/ide/ide.tsx`
     - `src/components/hooks/HooksConfigMenu.tsx`

4. 再回到 `Message*` 系列
   - 这组同时包含缺失模块恢复和消息联合类型兼容，复杂度更高

## 工作树说明

- 当前分支：`main`
- 近期提交：
  - `be95a4f9 chore(githooks): 添加提交校验钩子`
  - `fc9a6b79 fix: checkpoint type cleanup and runtime placeholders`
- 本地 hook 已经收紧为 `type(scope): description`
- `.claude/` 仍应保持不提交

## 当前未提交改动的性质

当前工作树中混合了三类改动：

1. 基线恢复
   - `package.json`
   - `bun.lock`
   - `.gitignore`
   - 一批 `src/...` 新增文件

2. 已验证能推动 `typecheck` 前移的局部修补
   - 主要集中在 commands、bridge、feedback、LogoV2、hooks 等文件

3. 尚未完成收口的 props 类型簇
   - 当前已在工作树中出现修改，但还没有把该簇清到通过
   - 继续接手时要先以 `bun run typecheck | Select-Object -First 80` 复核头部

## 建议提交策略

- 不要把“基线恢复”和“后续类型修补”混成一个超大提交
- 更合适的拆分：
  1. `fix(runtime): restore missing project baseline`
  2. `fix(types): tighten app state boundaries`
  3. `fix(ui): type component props in diff and markdown views`

## 备注

- 本轮尝试过用小代理并行处理组件 props 类型簇，但在切换到交接整理前已停止，没有可直接复用的结果
- GitNexus MCP 工具在当前会话中不可用，因此本轮对代码改动采用了 Serena 符号查询 + 本地文件窗口的轻量影响检查

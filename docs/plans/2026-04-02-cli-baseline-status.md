# 2026-04-02 CLI 基线状态

## 已解决

- 会话级 provider 切换入口已接入：
  - 启动参数 `--provider <provider>`
  - 会话命令 `/provider`
  - 状态栏显示当前 provider 与 base provider
- `TungstenTool` 缺失不再导致 CLI 在模块加载阶段直接崩溃：
  - `src/tools.ts` 改为可选加载
  - `src/screens/REPL.tsx` 改为可选加载 `TungstenLiveMonitor`
  - `src/components/agents/ToolSelector.tsx` 改为可选读取 Tungsten 名称
- Bun 下不再走 `@commander-js/extra-typings` 运行时入口：
  - `src/main.tsx`
  - `src/commands/mcp/addCommand.ts`
  - `src/commands/mcp/xaaIdpCommand.ts`
  - 已切换到 `commander`
- 源码模式 `bun src/entrypoints/cli.tsx --version` 已可工作：
  - 当前兜底输出为 `dev (Neko Code)`

## 当前阻塞（2026-04-03 更新）

### 1. 全仓 TypeScript 工程仍未收口

根目录运行依赖基线已经补齐：

- `package.json`
- `bun.lock`
- `node_modules`
- `typescript`
- `@types/bun`
- `@types/react`
- `@types/qrcode`

当前阻塞已经从“无法启动”转成“工程未完全补齐”。执行 `bun run typecheck` 仍会失败，主要集中在：

- 仓库快照中直接缺失的源码模块，例如：
  - `src/types/message.js`
  - `src/services/oauth/types.js`
  - `src/assistant/index.js`
  - 若干 `Transport.js` / `querySource.js` / `tools.js` 对应模块
- SDK 生成类型仍是占位实现，部分字段过宽，导致 bridge / structured IO / CCR 相关代码出现大量 `unknown` 类型错误
- bridge / remote / session 等深路径还有未回收的类型问题，不再是单纯依赖缺失

这说明运行环境已是一个可直接启动的 Bun 工程，但还不是一个可完整 typecheck 的工程。

### 2. 仍存在构建期宏依赖

源码模式下部分位置依赖构建注入的 `MACRO.VERSION` / `MACRO.BUILD_TIME`。

本轮已补：

- `src/entrypoints/cli.tsx`
- `src/main.tsx`
- `src/commands/version.ts`
- `src/types/runtime-globals.d.ts` 全局兜底声明

后续若继续推进“源码直跑”能力，仍需系统梳理其它 `MACRO.*` 入口。

## 已完成验证

- `bun src/entrypoints/cli.tsx --version`
  - 输出：`dev (Neko Code)`
- `bun src/entrypoints/cli.tsx --help`
  - 已可正常输出帮助
- `bun src/entrypoints/cli.tsx --provider gemini --help`
  - 已可正常输出帮助
- `bun src/entrypoints/cli.tsx --model sonnet --provider gemini --help`
  - 已可正常输出帮助
- `bun run typecheck`
  - TypeScript 已能以 Bun/TSX 工程方式解析仓库
  - 当前失败点已收敛为真实源码/类型缺口，而不是根配置或根依赖缺失

## 下一步建议

1. 优先恢复缺失的源码模块快照，先处理 `src/types/message.js` 这一类高频依赖
2. 恢复或重新生成 SDK 类型文件，逐步替换当前宽松占位类型
3. 在 bridge / structured IO / remote 相关路径里按编译错误收窄字段类型
4. 完成后继续验证：
   - `bun run typecheck`
   - `bun src/entrypoints/cli.tsx --help`
   - `bun src/entrypoints/cli.tsx --provider gemini --help`
   - `bun src/entrypoints/cli.tsx --model sonnet --provider gemini --help`

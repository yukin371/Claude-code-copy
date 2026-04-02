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

## 当前阻塞

### 1. 运行依赖基线缺失

仓库根目录当前没有：

- `package.json`
- `bun.lock` / `bun.lockb`
- `node_modules`

因此 `bun src/entrypoints/cli.tsx --help` 当前失败为：

- `ENOENT while resolving package 'commander' from 'src/main.tsx'`

这说明代码级阻塞已经收敛，但运行环境还不是一个可直接启动的 Bun 工程。

### 2. 仍存在构建期宏依赖

源码模式下部分位置依赖构建注入的 `MACRO.VERSION` / `MACRO.BUILD_TIME`。

本轮已补：

- `src/entrypoints/cli.tsx`
- `src/main.tsx`
- `src/commands/version.ts`

后续若继续推进“源码直跑”能力，仍需系统梳理其它 `MACRO.*` 入口。

## 已完成验证

- `bun src/entrypoints/cli.tsx --version`
  - 输出：`dev (Neko Code)`
- `bun src/entrypoints/cli.tsx --help`
  - 不再报 `TungstenTool` 缺失
  - 不再报 `@commander-js/extra-typings` 递归栈溢出
  - 当前卡在 `commander` 依赖不存在

## 下一步建议

1. 明确仓库的运行形态：
   - 是补齐 Bun 工程依赖并支持源码直跑
   - 还是维持构建产物运行，仅修源码兼容性
2. 如果目标是源码直跑：
   - 补 `package.json`
   - 补 Bun 依赖安装入口
   - 统一处理 `MACRO.*` 源码兜底
3. 依赖基线补齐后，重新验证：
   - `bun src/entrypoints/cli.tsx --help`
   - `bun src/entrypoints/cli.tsx --provider gemini --help`
   - `bun src/entrypoints/cli.tsx --model sonnet --provider gemini --help`

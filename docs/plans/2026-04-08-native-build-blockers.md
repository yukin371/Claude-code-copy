# Native Build Blockers 分类清单

日期：2026-04-08

## Status

- 当前状态：resolved for current baseline
- 最新结果：
  - `bun run build:native` 已成功
  - `dist/neko-code.exe --version` 已通过
  - `dist/neko-code.exe --help` 已通过
- 说明：
  - 这份文档保留为本轮 blocker 清理记录，后续如果 native build 再次回退，可直接按同样分类方式续写

## Goal

- 为 `bun build --compile src/entrypoints/cli.tsx` 的当前阻塞建立一份可执行、可分批清理的清单。
- 把 blocker 拆成明确类别，避免后续每一轮重复摸排。

## Scope

- in:
  - 当前已观察到的 compile blocker
  - blocker 分类
  - 建议修复顺序
- out:
  - 不在本清单里直接实现所有 blocker 修复
  - 不把运行时 bug、路由 bug、状态链路 bug 混入 compile blocker

## Current Command

当前已打通命令：

```bash
bun build --compile src/entrypoints/cli.tsx --outfile dist/neko-code.exe
```

## 分类规则

### A. 缺失模块

特征：

- 源码中存在 `require()` / `import()` 引用
- 目标路径在仓库中不存在
- 即使功能运行时可能不走到，compile 阶段仍会解析失败

### B. 缺失依赖

特征：

- 源码引用了外部包
- `package.json` 当前未声明该依赖
- compile 阶段解析外部包时直接失败

### C. 可裁剪 / ant-only / 非当前分发目标

特征：

- 当前路径明显依赖 `USER_TYPE === 'ant'`、内部构建、或仅在特定分发模式使用
- 更合理的修复方式可能不是“补齐全部实现”，而是给 native/public build 做显式裁剪或 stub

## 本轮清理结果

- A. 缺失模块：
  - 已通过 compile-safe stub / fallback 收口
- B. 缺失依赖：
  - 已补齐到 `package.json`
- C. 可裁剪 / ant-only / 非当前分发目标：
  - 当前仍保留为后续“真实实现或显式裁剪”的治理项
  - 但已不再阻塞本轮 native build

## 分类结果（清理前记录）

## A. 缺失模块

这些路径已确认 `Test-Path = false`：

- `src/utils/protectedNamespace.js`
- `src/tools/REPLTool/REPLTool.js`
- `src/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js`
- `src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js`
- `src/commands/agents-platform/index.js`
- `src/components/AntModelSwitchCallout.js`
- `src/components/UndercoverAutoCallout.js`

### 说明

- 其中部分功能已有周边常量或类型残留，例如：
  - `src/tools/REPLTool/constants.js`
  - `src/tools/REPLTool/primitiveTools.js`
  - `src/utils/model/antModels.ts`
- 这说明它们不是“完全未知功能”，但当前入口文件本身缺失。

## B. 缺失依赖

这些包已确认当前 `package.json` 未声明：

- `@anthropic-ai/bedrock-sdk`
- `@anthropic-ai/foundry-sdk`
- `@anthropic-ai/vertex-sdk`
- `@azure/identity`
- `@aws-sdk/client-sts`
- `@aws-sdk/client-bedrock`
- `turndown`
- `sharp`
- `modifiers-napi`

### 说明

- 这些包都在源码中有真实引用，不是误报。
- 其中一部分已有 `d.ts` 占位，例如：
  - `src/types/external-modules.d.ts`
- 这意味着类型层已经考虑过兼容，但运行/打包层还没补齐。

## C. 可裁剪 / ant-only / 非当前分发目标

这些 blocker 不应默认按“恢复完整实现”处理，优先判断是否裁剪：

- `src/components/AntModelSwitchCallout.js`
  - 仅在 `process.env.USER_TYPE === 'ant'` 分支下引用
- `src/components/UndercoverAutoCallout.js`
  - 仅在 `process.env.USER_TYPE === 'ant'` 分支下引用
- `src/tools/REPLTool/REPLTool.js`
  - 当前看起来更偏 REPL/ant/native 内部能力，不应在 Phase 1 为了解锁 compile 盲目做完整恢复
- `src/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js`
  - 更偏高级工作流能力，不是终端直启最小闭环的必要能力
- `src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js`
  - 更偏计划执行验证增强，不是终端直启最小闭环的必要能力
- `src/commands/agents-platform/index.js`
  - 更像平台化命令入口，需先确认是否属于当前 public/native build 必需命令
- `@anthropic-ai/bedrock-sdk`
- `@anthropic-ai/foundry-sdk`
- `@anthropic-ai/vertex-sdk`
- `@azure/identity`
  - 以上都属于特定 provider/credential 集成，需先判断是“当前 native build 必需能力”还是“可延迟到 Phase 2/4”

## 建议修复顺序

### Batch 1. 先解锁最小 public/native build

- 为明显 ant-only UI/入口提供可裁剪 stub 或 build-safe fallback
- 优先处理：
  - `src/components/AntModelSwitchCallout.js`
  - `src/components/UndercoverAutoCallout.js`
  - `src/utils/protectedNamespace.js`
  - `src/commands/agents-platform/index.js`

目标：

- 尽快减少 compile 阶段的“纯缺文件”错误
- 不在这一步恢复高级功能细节

### Batch 2. 清理 REPL / 高级工具入口的 compile 依赖

- 处理：
  - `src/tools/REPLTool/REPLTool.js`
  - `src/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js`
  - `src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js`

目标：

- 明确哪些要补最小 stub
- 哪些要保留但延迟到状态型工作流阶段

### Batch 3. 明确依赖策略

- 对外部依赖逐个判断：
  - 当前 native/public build 是否必须
  - 是否可按 provider/feature 懒加载
  - 是否应直接补入 `package.json`
  - 是否应在 public/native build 裁剪

优先看：

- `turndown`
- `sharp`
- `modifiers-napi`
- `@aws-sdk/client-sts`
- `@aws-sdk/client-bedrock`

这些更可能在公共功能里被真实使用。

### Batch 4. provider 专属依赖

- `@anthropic-ai/bedrock-sdk`
- `@anthropic-ai/foundry-sdk`
- `@anthropic-ai/vertex-sdk`
- `@azure/identity`

目标：

- 判断它们是否进入当前 native build 基线
- 或者在当前阶段通过更严格的 provider feature gate 排除

## Exit Conditions

- 这份 blocker 清单被 roadmap / staged delivery plan 引用或吸收
- 当前基线下 `bun run build:native` 可稳定通过
- 后续若 native build 再出现回退，继续按 batch 方式补充，而不是重新枚举 blocker

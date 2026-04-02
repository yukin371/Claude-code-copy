# Bun 运行时说明

项目默认以 Bun 作为运行时和脚本执行器。

## 约定

- 优先使用 `bun`、`bun run`、`bunx`。
- 不要默认写成 `npm`、`node`、`npx`。
- 代码中可直接使用 Bun 原生能力和 `bun:bundle`。
- 新增工具脚本优先放在 `scripts/`。

## 常用命令

- `bun --version`
- `bun run scripts/bun-tools.ts help`
- `bun run scripts/bun-tools.ts doctor`
- `bun run scripts/bun-tools.ts env`
- `bun run scripts/bun-tools.ts providers`
- `bun run scripts/bun-tools.ts health [provider]`

## 现有入口

- `src/entrypoints/cli.tsx` 是主 CLI 入口。
- `src/commands/doctor/doctor.tsx` 是仓库内置的健康检查命令。

## 使用建议

- 本地调试优先走 Bun 直跑，不要先补 package manager 包装层。
- 如果后续补 `package.json`，也应把 Bun 保持为主运行时。
- 需要一次性工具时，优先新增 `scripts/` 下的 Bun 脚本，再在文档里引用。

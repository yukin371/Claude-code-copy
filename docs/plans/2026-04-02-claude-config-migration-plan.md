# Claude 配置自动迁移计划

## 目标

在 Neko Code 首次启动时，自动从 `~/.claude` 向 `~/.neko-code` 迁移最核心的用户配置，减少切换成本，同时避免把 Claude 的运行时缓存和历史数据整包复制过来。

## 范围

- 迁移全局配置文件：旧 `~/.claude/.claude*.json` 或 `~/.claude/.config.json`
- 迁移用户 settings：`settings.json`、`cowork_settings.json`
- 迁移凭据文件：`.credentials.json`
- 迁移用户级记忆与规则：`CLAUDE.md`、`rules/`

## 不迁移的内容

- `projects/`
- `debug/`
- `traces/`
- `startup-perf/`
- `sessions/`
- 其他运行时缓存、临时文件和诊断产物

## 约束

- 只在默认目录迁移路径下生效，即 `~/.claude` -> `~/.neko-code`
- 若用户显式设置 `NEKO_CODE_CONFIG_DIR` 或 `CLAUDE_CONFIG_DIR`，不自动迁移
- 若目标文件已存在，不覆盖已有 Neko 配置
- 迁移逻辑必须幂等，可重复执行
- 迁移应挂到 `src/migrations/` 与 `main.tsx` 的统一 migration runner，而不是散落在配置读取路径中

## 验证

- 覆盖“缺失文件可迁移”
- 覆盖“已有 Neko 配置不被覆盖”
- 覆盖 `rules/` 目录缺失文件的递归补齐

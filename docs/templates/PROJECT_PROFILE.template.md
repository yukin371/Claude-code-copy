# PROJECT_PROFILE

## Repository Mode

- `完整模式` 或 `轻量模式`

## Project Type

- `TBD`

## Business Goal

- 当前仓库解决什么问题
- 哪类需求不属于本仓库

## Tech Stack

- Runtime:
- Language:
- Framework:
- Build / package:

## Entry Points

- 主入口:
- 次入口:
- 非交互入口:

## Core Data Flow

1. 输入从哪里进入
2. 经过哪些核心模块
3. 输出写到哪里

## Repository Topology

- `src/...`:
- `scripts/...`:
- `docs/...`:

## Shared Owners

- config:
- logging:
- persistence:
- API client:
- shared utilities:

## Verification Commands

- `bun run typecheck`

## High-Risk Areas

- `TBD`: 为什么高风险，改动时需要先看什么

## Fact Verification

| Fact | Source A | Source B | Status |
| --- | --- | --- | --- |
| 项目类型 | `README` | `package.json` | `confirmed / TBD` |
| 运行入口 | `README` | `src/...` | `confirmed / TBD` |
| 验证命令 | `README` | `package.json` / CI | `confirmed / TBD` |

## Fast Read Path

1. `docs/PROJECT_PROFILE.md`
2. `docs/roadmap.md`
3. 入口模块 `MODULE.md`
4. 当前活跃 plan / ADR

# ARCHITECTURE_GUARDRAILS

## Layers

- Interface / entry:
- Application / orchestration:
- Domain / shared logic:
- Infrastructure:

## Dependency Direction

- 允许依赖方向:
- 禁止反向依赖:

## Canonical Owners

- config:
- logging:
- auth:
- persistence:
- API client:
- shared utilities:
- file / path helpers:
- feature flags:

## Forbidden Imports

- 哪些层或模块不能直接互相 import

## Forbidden Ownership

- 哪些职责不能分散到多个模块重复持有

## ASCII Diagram

```text
[entry] -> [application] -> [domain] -> [infrastructure]
```

## Forbidden Import Checks

将可自动检查的规则写成下面 JSON 数组。`regex` 命中即失败。

```json
[]
```

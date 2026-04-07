# AGENTS

## Mission

- 先建立边界、验证路径和知识入口，再开始改动

## Read First

1. `docs/PROJECT_PROFILE.md`
2. `docs/roadmap.md`
3. 目标模块 `MODULE.md`
4. 当前相关 `docs/plans/...` 或 `docs/decisions/...`

## Working Rules

- 先复用后新增
- 改共享能力前先回答 6 个强制问题
- 大改前先输出边界摘要
- 事实不确定时写 `TBD`，不要编造
- 发现上游事实错误时，先修文档再继续实现

## Before Non-Trivial Changes

输出：

```text
目标模块：
现有 owner：
影响面：
计划改动：
验证方式：
需要同步的文档：
```

## After Completion

输出：

```text
已完成改动：
验证结果：
未验证区域：
同步文档：
残留风险：
```

## Stop And Ask When

- canonical owner 无法判断
- 多个来源对关键事实冲突
- 改动会跨 3 个以上模块且边界不清
- 需要引入新的 shared utility / service 但复用路径不清

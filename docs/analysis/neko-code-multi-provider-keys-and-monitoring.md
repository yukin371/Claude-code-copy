# Multi-Provider Keys And Monitoring (Design)

This document proposes a multi-dimensional provider strategy for Neko Code:

- Users can configure one or more API keys per provider.
- Each key declares which models it can be used with (capability contract).
- Users can define routing rules for which tasks use which model/provider/key.
- A monitor tracks requests and token usage (measured when the upstream provides it, estimated otherwise).
- Before reaching quota limits (common 5-hour windows), the system can warn and optionally generate a handoff summary to avoid mid-task failure.

This is a design doc intended to be implemented incrementally without breaking existing env-driven routing.

## Goals

- Keep current `taskRoutes` / env routing behavior as the default.
- Add a structured key registry (keys are not pooled via `baseUrl/apiKey` comma lists).
- Support per-key capability constraints:
  - model allow/deny, max context window, max output tokens
  - custom compaction target (how aggressively to compact)
  - billing/quota dimensions (requests, tokens, USD)
  - expiry and validity windows
- Provide predictable, debuggable routing decisions.
- Provide proactive quota warnings and a "handoff summary" option.

Non-goals (for the first iteration):

- A full gateway-like policy engine (that belongs in an external proxy).
- Exact token accounting for every upstream (many OpenAI-compatible providers omit usage).
- Server-side enforcement; this is a client-side safety monitor.

## Concepts

Terminology used below:

- Provider: `anthropic`, `codex`, `gemini`, `glm`, `minimax`, `openai-compatible`.
- Upstream: concrete `baseUrl` + `apiStyle` contract.
- Key: an API credential with metadata (capabilities + quota + expiry).
- Route: coarse task grouping (`main`, `subagent`, `frontend`, `review`, etc.).
- QuerySource: finer-grained origin label already used for routing/debug.

## Configuration Shape (Proposed)

All fields are optional. Existing configurations remain valid.

### 1) Key registry

`settings.json`:

```json
{
  "providerKeys": [
    {
      "id": "gemini-payg-1",
      "provider": "gemini",
      "secretEnv": "NEKO_CODE_GEMINI_API_KEY",
      "models": ["gemini-2.5-pro", "gemini-2.5-flash"],
      "expiresAt": "2026-05-01T00:00:00Z",
      "limits": {
        "windowSeconds": 18000,
        "maxRequests": 500,
        "maxTotalTokens": 2000000
      },
      "context": {
        "maxContextTokens": 128000,
        "compactTargetTokens": 20000
      }
    }
  ]
}
```

Notes:

- `secretEnv` is preferred over inline `secret` to avoid writing secrets to disk.
- `models` is an allowlist contract. Later we can add patterns (glob/regex) and per-model overrides.
- `windowSeconds` defaults to `18000` (5 hours) when omitted for 5-hour plans.

### 2) Route -> provider/model/key

Extend existing `taskRoutes`:

```json
{
  "taskRoutes": {
    "frontend": { "provider": "gemini", "model": "gemini-2.5-pro", "keyRef": "gemini-payg-1" },
    "review": { "provider": "codex", "model": "gpt-4.1", "keyRef": "codex-team" }
  }
}
```

Rule:

- `keyRef` is a reference to `providerKeys[].id`.
- When `keyRef` is present, routing should resolve `apiKey` from that key and treat it as a single-upstream pin for API-key purposes (still allowing default provider baseUrls unless `baseUrl` is explicitly set).

### 3) Fine-grained routing (optional, later)

If we want "task-level inside main route", introduce a rule list keyed by `querySource`:

```json
{
  "taskRouteRules": [
    { "matchQuerySource": "web_search_tool", "model": "gemini-2.5-flash", "provider": "gemini", "keyRef": "gemini-payg-1" },
    { "matchQuerySourcePrefix": "agent:builtin:plan", "route": "plan", "model": "sonnet" }
  ]
}
```

This is intentionally additive: it should only override fields provided by the rule.

## Routing Algorithm (Proposed)

Inputs:

- `route` (derived from agentType/taskHints/taskPrompt or querySource)
- desired `provider/apiStyle/model/baseUrl` (existing logic)
- optional `keyRef` (new)

Steps:

1. Resolve route execution target (existing): provider + apiStyle + model.
2. Resolve transport baseUrl (existing): explicit route baseUrl wins; else global gateway baseUrl; else provider defaults.
3. Resolve API key:
   - If route env `NEKO_CODE_*_API_KEY` is set, use it (highest priority, explicit pin).
   - Else if route settings include `keyRef`, resolve key from registry:
     - validate provider match (or allow provider omission with implied provider = route provider)
     - validate expiry (now < expiresAt)
     - validate model allowlist (desired model is permitted)
     - resolve secret from `secretEnv` (or inline secret if allowed)
   - Else fall back to existing provider env key resolution (including env list split).
4. If resolved key is invalid (expired / missing / model not allowed), routing should fail early with a clear error that points to the misconfiguration and suggests either changing route model/provider or adjusting key capabilities.
5. Attach a stable "key identity" for monitoring (do NOT log secrets):
   - `keyId = keyRef` when configured
   - else `keyId = hash(prefix(apiKey))` as best-effort (optional)

## Monitoring Strategy (Proposed)

We track usage across multiple dimensions:

- requests: count of API calls
- tokens: input/output/cache-read/cache-write
- estimated tokens: when upstream omits usage
- USD (optional): computed from per-model pricing if known, else "unknown"

### Data model

Per key (`keyId`) maintain rolling windows:

- `windowSeconds` (default 5 hours if configured)
- `windowStartEpochMs`
- counters:
  - `requests`
  - `inputTokens`, `outputTokens`
  - `estimatedInputTokens`, `estimatedOutputTokens`
  - `costUsd` (optional)

Persist:

- Store in project config as "last known usage" so it survives restart.
- Never persist raw secrets.

### Measurement sources

Priority:

1. Use provider response usage fields if present (OpenAI usage, Anthropic BetaUsage).
2. If missing, estimate:
   - prompt tokens: `roughTokenCountEstimation(content, bytesPerToken)`
   - tool results: use existing token estimation heuristics already used for context management

Maintain a flag `isEstimated` per measurement so UI can label it.

### Warning thresholds and actions

For each dimension (requests, totalTokens, USD) define thresholds:

- warn at 80%-90% (configurable)
- block/switch at 100%

Actions, in priority order:

1. Switch to a fallback key for the same provider (if available and compatible).
2. Switch to a cheaper model for the same task route (if configured).
3. Trigger a handoff summary:
   - run a short summarizer request on a cheap/reserved key
   - output a structured summary ("What we did", "Current state", "Next steps", "Open questions", "Commands run")
4. Gracefully stop the agent loop with a clear message.

### Handoff summary contract

The goal is to avoid "work lost" when quota is close to exhausted.

Minimum output (machine-readable, for copy/paste):

- current goal
- what is done
- what remains
- exact file paths touched
- commands to re-run
- key configuration hints (if relevant)

The handoff should be triggered before the system enters a fragile multi-turn phase (e.g., long refactors, release chain).

## Implementation Plan (Incremental)

Phase 1 (config + routing):

- Extend settings schema:
  - `providerKeys[]`
  - `taskRoutes.*.keyRef`
- Resolve `keyRef` -> `apiKey` in task routing.
- Update routing debug snapshots to include keyRef identity (masked).

Phase 2 (monitor core):

- Add `keyQuotaMonitor` module that records usage per resolved keyId.
- Hook into API clients:
  - OpenAI-compatible client: already maps usage; record after response.
  - Anthropic client: record from BetaUsage.
- Add CLI surfaces:
  - `/usage` view includes per-key usage.
  - statusline JSON includes per-key and per-window utilization.

Phase 3 (proactive handoff):

- Add pre-flight check before dispatching an API call:
  - compute projected utilization
  - warn / switch / handoff based on policy

## Notes On External References

This design aligns with patterns in open-source LLM gateways/proxies:

- "virtual keys" and per-key budgets/model access control
- per-key usage metering and rate limiting

We intentionally keep enforcement client-side and lightweight; external gateways can remain the source of truth when needed.


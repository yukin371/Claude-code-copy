# Model Routing Module Guide

This module is the source of truth for task-level model and provider routing.

## Non-negotiables

- Do not hardcode model names in source.
- Read route-specific model/provider/baseUrl from `settings.json.taskRoutes` first.
- Preserve env var overrides, but keep them as overrides, not defaults.
- Keep route selection in `taskRouting.ts`; do not duplicate heuristics elsewhere.
- Keep provider transport defaults in `providerMetadata.ts`; do not duplicate base URL or API key env lists elsewhere.
- Keep OpenAI-compatible request translation in `src/services/api/openaiCompatibleClient.ts`.
- Keep Anthropic-only APIs on the Anthropic path unless a route explicitly opts into the compatible shim.

## Route contract

- `provider` selects the provider family.
- `apiStyle` selects the transport shape.
- `model` is user-configured and opaque to the router.
- `baseUrl` is optional and forces OpenAI-compatible transport.

## Change flow

1. Add or change schema in `src/utils/settings/types.ts`.
2. Update route resolution in `taskRouting.ts`.
3. Update provider metadata in `providerMetadata.ts` if provider defaults change.
4. Wire explicit transport into `src/services/api/client.ts`.
5. Update docs and roadmap.

## Guardrails

- Token counting and capability probing may still require Anthropic SDK paths.
- Do not route those helper paths through the compatible shim unless they are verified to support the same API surface.
- If a new provider is added, update provider defaults, env parsing, and fallback behavior together.

## Current intent

- Main, subagent, frontend, and review routes should be configurable per user or project.
- The router should choose the right provider and model, while the API layer handles transport translation.
- Long-term load balancing, circuit breaking, key pools, and aggregation belong to an external gateway or operational layer, not to the per-call model resolver.
- Any in-app fallback should stay minimal, explicit, and safety-oriented.

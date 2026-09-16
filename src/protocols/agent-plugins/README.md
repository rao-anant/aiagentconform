# Agent Plugins 1.0.0

`index.ts` evaluates the static package checks. `rules.ts` is the stable rule
catalog with normative URLs. `validation.ts` compiles the local official
2020-12 schemas and checks skill/transport semantics. `paths.ts` handles
filesystem containment and single-pass placeholder replacement.

No runtime transport implementation is included. See the repository README
for supported checks and references/agent-plugins-1.0.0/SOURCES.md for scope,
interpretations, and deferred requirements. Vendored schemas are Apache-2.0.

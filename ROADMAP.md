# Roadmap

## Implemented

- Node.js, strict TypeScript, Commander, Ajv, and Vitest foundation
- `aiconform <plugin-directory>` with terminal and structured JSON reports
- First Agent Plugins 1.0.0 module with 20 static checks and stable rule IDs
- Official schema vendoring, specification references, and scope documentation
- Valid/invalid fixtures and per-rule tests
- Independent manifest, component, skill, and server failure boundaries
- Fixed-version composite GitHub Action with JSON v2 artifacts and job summaries

## Next

- Track specification revisions and clarify documented ambiguities upstream
- Extend static coverage with explicitly justified normative checks
- Add advisory lint rules separately from strict conformance
- Extend CI integration coverage and configuration options without weakening the fixed report contract
- Expand operating-system coverage for path and symlink behavior

## Later / outside the current implementation

- Client-context validation for persistent plugin data paths
- Runtime conformance harnesses, only as a separately designed feature
- Additional protocol modules when their normative sources are selected
- Contributor guidance for protocol and rule authors

Runtime/sandbox execution and separate MCP, A2A, and AP2 modules are not included.

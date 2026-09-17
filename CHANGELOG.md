# Changelog

## 0.2.0 — Unreleased

No npm package, tag, GitHub release, or hosted artifact has been created for
this version.

### Added

- Enhanced terminal reporting with qualified determinations, component presence,
  extension namespaces, MCP server declarations, and explicit static-scope limits.
- Opt-in JSON report v2 through `--json --report-version 2`, with exactly one of
  `passed`, `failed`, `not_applicable`, `excluded`, or `unable_to_complete` for
  every AP001-AP020 rule.
- Closed `report-v2.schema.json`, structured inspection evidence, execution
  problems, scope limitations, outcome counts, and final determination.
- `--json` as the documented shorthand for the retained `--format json` form.

### Compatibility

- JSON v1 remains the default throughout v0.2.x; its schema, serialization, and
  legacy exit behavior remain available unchanged.
- JSON v1 keeps `FAIL`/exit 1 for mixed conformance failure plus incomplete
  inspection. Terminal and JSON v2 use exit 2 whenever a selected rule is
  `unable_to_complete`. This exception will be unified when JSON v2 becomes the
  default in a future major release.
- AP001-AP020 IDs and validation meanings are unchanged.

## 0.1.0 — Unreleased

Initial release candidate. No npm package or GitHub release has been published
from this repository.

### Renamed

- Product: AIAgentConform; npm package: `aiagentconform`; CLI: `aiconform`.
- Updated documentation, CLI messages, tests, and CI examples.
- AP001–AP020 IDs, validation behavior, report version, and package version are unchanged.
- Repository metadata now targets `rao-anant/aiagentconform`.

### Added

- Agent Plugins 1.0.0 static module with AP001–AP020, official references,
  vendored schemas, and valid/invalid fixtures.
- `aiconform <plugin-directory>` with terminal and JSON formats, help/version,
  rule listing, and individual-rule selection with prerequisite handling.
- Concise rule-based terminal summaries and failure-level specification links.
- Version 1 JSON output schema, explicit skipped/incomplete results, and
  documented exit codes 0 (pass), 1 (conformance failure), 2 (incomplete/error).
- Contributor guide, GitHub Actions consumer example, source verification
  workflow, and isolated npm tarball/CLI verification.

### Corrected during pre-release review

- AP009 now rejects non-object extension member values for package conformance,
  separately from client ignore behavior; namespace object contents remain opaque
  and independent component checks continue. Other rule behavior is unchanged.

- Distinguish inspection failures from invalid package syntax.
- Reject malformed UTF-8 instead of silently decoding replacement characters.
- Enforce manifest-name characters beyond the upstream regex's final-newline
  loophole.
- Accept YAML delimiter whitespace and literal executable-name punctuation.
- Reject URL control bytes before URL-parser normalization.
- Report unavailable PLUGIN_DATA cwd context as incomplete instead of inferring
  containment from a synthetic directory.
- Count unique rules, keep unknown-field ordering deterministic, and avoid
  unrelated component traversal in selected-rule mode.
- Make rule IDs explicit and retain upstream schema licensing in npm artifacts.

### Known scope

No runtime execution, sandbox, network connections to plugin endpoints,
client-specific extension semantics, or additional protocol modules. See the
README and source review for remaining static-coverage limits and ambiguities.

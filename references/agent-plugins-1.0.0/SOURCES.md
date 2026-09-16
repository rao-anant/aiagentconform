# Agent Plugins references

Reviewed 2026-09-10 (local date). Agent Plugins specification **1.0.0**, status
**Published**. The page does not state a publication date; the review date is
not a release date. References recorded before implementation.

- Normative specification: https://agent-plugins.org/specification
- Normative client requirements: https://agent-plugins.org/specification#11-client-conformance
- Official, non-normative checklist: https://agent-plugins.org/client-implementers/conformance
- Manifest schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
- MCP configuration schema: https://agent-plugins.org/schemas/1.0.0/mcp.schema.json
- Incorporated skill format: https://agentskills.io/specification (unversioned living document; reviewed on the date above).

The canonical published site is agent-plugins.org. Search results also expose
an older working draft at agent-plugin.org and historical GitHub discussions;
those are not the implementation contract.

Schemas are vendored unchanged in src/protocols/agent-plugins/schemas, with
checksums in SHA256SUMS. Validation never fetches a package's declared schema.
Specification prose takes precedence over schemas. Documentation attribution:
Agent Plugins documentation contributors, 2026, CC BY 4.0.

## Scope decisions and ambiguities

AIAgentConform checks static package inputs; it is not a conformant executing client.
Findings distinguish package failure from the loader's failure boundary.
Unknown manifest fields and a non-object extensions field fail package checks
but do not block independently valid components (§5.2, §8.1).

AP009 was re-reviewed on 2026-09-15 against normative §8.1 and the official
manifest schema linked above. Package conformance requires an object container
and object member values. Client behavior is a separate obligation: ignore
unimplemented namespaces without validating their contents. AP009 now checks
only the package-level object types, reports non-object members as field
failures, and continues checking components. It does not validate fields inside
namespace objects. This corrects the earlier conflation of client ignore
behavior with package conformance. No runtime client is implemented.
Reverse-domain namespace syntax has no normative grammar; namespace spelling
and client-file classification remain deferred.

Skill naming prose says Unicode lowercase alphanumerics but also illustrates
ASCII a-z/0-9. Accept Unicode lowercase letters and numbers, without normalization;
require an exact directory-name match. Unknown skill frontmatter fields are not
rejected: the referenced prose does not expressly close that mapping. No minimum
Markdown body length is imposed, consistent with its minimal frontmatter example.

Command token syntax is platform-dependent. Explicit ./ paths may contain spaces;
bare names with whitespace are treated as command strings. Shell punctuation
is literal, not prohibited. See REVIEW.md for the remaining ambiguity.
No executable lookup, executable permission, existence, or launch requirement is
invented. Missing command/cwd tails are resolved against existing ancestors for
static containment. Runtime existence and directory suitability remain unchecked.

PLUGIN_DATA is client-managed and unavailable to this CLI. Report any cwd that uses it as incomplete, and never create a data directory.
A synthetic anchor cannot establish filesystem containment; see REVIEW.md.
Unknown placeholder text stays literal; args/env values are not treated as paths.

Deferred: subprocess environment, persistence, execution, sandboxing, MCP wire
behavior, authentication, redirects, runtime path races, extension semantics,
secret detection, ambient-variable dependencies, and executable provenance.
These need runtime/client context or cannot be determined without heuristics.
Arbitrary unused package files and Markdown links are not traversed; containment
is enforced for paths this checker discovers or interprets. Advisory quality
checks (SemVer, SPDX, description quality, body length) are not implemented.
Plugin release versions and skill metadata versions are not compared: only the
two canonical schema versions are required to match (§10.1).

The release-quality re-review and rule-by-rule audit are in [REVIEW.md](REVIEW.md).

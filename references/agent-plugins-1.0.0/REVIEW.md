# v0.1.0 rule review

Re-reviewed 2026-09-10 (America/Los_Angeles) against the published Agent Plugins
1.0.0 specification at https://agent-plugins.org/specification, its official
client checklist at https://agent-plugins.org/client-implementers/conformance,
and https://agentskills.io/specification. The published pages and both schema
URLs were read again; downloaded schemas remain byte-identical to the vendored
copies. The checklist is non-normative. No newer format is implicitly accepted.

| Rule | Normative basis | False-positive / false-negative review |
| --- | --- | --- |
| AP001 | §4.1, §5.1 | Root manifest only; alternate vendor manifests do not substitute. No component required. |
| AP002 | §4.1 | Resolve inspected symlinks and preserve symlink-before-`..` semantics. Unused package files are not scanned. |
| AP003 | §5.2 | JSON object required; malformed UTF-8 now rejected, rather than replaced during decoding. |
| AP004 | §5.3 | Only `$schema` and `name` required; no invented version/description requirement. |
| AP005 | §5.2 | Exact locally supported canonical identifier; never fetch input-supplied URLs. |
| AP006 | §5.5 | Added normative character guard: upstream `$` regex accepts a final newline in JavaScript. |
| AP007 | §5.4 | Types only, closed author; no SemVer, URL, email, or SPDX format failures. |
| AP008 | §5.2 | Every unknown field fails package conformance but does not prevent discovery. Findings sorted by key. |
| AP009 | §8.1 | Updated 2026-09-15: package container/member object types are checked; namespace object contents are not. Client ignore behavior is distinct; discovery continues. |
| AP010 | §6.1–6.2 | Missing components valid; wrong filesystem kinds isolated. No requirement to populate skills or servers. |
| AP011 | §7.1 + Agent Skills format | Immediate children only, exact regular SKILL.md. Non-skill children ignored. YAML delimiter whitespace accepted; strict UTF-8. |
| AP012 | §7.1 + Agent Skills frontmatter | Names match directories; documented field types/limits only. Unicode naming ambiguity retained; unknown keys/body length not rejected. |
| AP013 | §7.2.1 | JSON object and strict UTF-8; document failure leaves skills independent. |
| AP014 | §7.2.1 | Closed top level with required fields; empty server maps allowed. |
| AP015 | §7.2.1 | Exact canonical identifier, no aliases or inferred compatibility. |
| AP016 | §7.2.2, §10.1 | Compare format versions only; do not compare plugin/skill release metadata. |
| AP017 | §7.2.1, §9.2 | Validate each closed transport independently; local schema includes reserved environment names. Report selected variant errors without other variants' noise. |
| AP018 | §4.1, §7.2.1 | No executable lookup or expansion. Bare-token punctuation can be literal, so removed the invented punctuation allowlist. Whitespace in explicit ./ paths allowed. |
| AP019 | §4.1, §7.2.1, §9.2 | Existing plugin-root paths resolved after single-pass expansion. Removed synthetic PLUGIN_DATA roots: containment is incomplete without client filesystem context. |
| AP020 | §7.2.1 | Literal URL/header validation, loopback-only HTTP, no credentials/fragments or case-duplicate headers. Raw control bytes now rejected before URL normalization. |

## Interpretation boundaries

- **Extensions (AP009 follow-up, 2026-09-15):** The earlier review incorrectly
  used client ignore behavior to permit non-object package values. §8.1 and the
  official schema require object member values for package conformance. AP009
  now reports violations of that shallow type requirement without examining
  object contents. Clients separately must ignore namespaces they do not
  implement; these package findings do not block independent component checks.
  Namespace syntax has no normative grammar, and client-specific file
  classification is not inferred.
- **Skill names:** The referenced prose combines Unicode terminology and ASCII
  examples. The current rule accepts Unicode lowercase letters and numbers;
  no normalization or ASCII-only restriction is invented.
- **Commands:** A token can name an executable whose filename contains punctuation
  or spaces. AIAgentConform accepts spaces for explicit ./ paths and rejects whitespace
  in bare command strings as apparent multiple tokens. Bare-name whitespace remains
  an unresolved portability ambiguity. It does not interpret shell metacharacters.
- **Data paths:** A lexical `..` can be contained after symlink resolution or can
  escape a lexically safe path. A made-up PLUGIN_DATA directory cannot establish
  conformance. Any cwd using it now produces a client-context-required skip and
  exit 2 unless another selected check fails (exit 1). Args/env placeholders
  remain opaque and do not cause this skip.
- **Filesystem:** Static checks describe the host filesystem at inspection time.
  Missing command/cwd tails and runtime changes are not executable-existence or
  sandbox guarantees. Native path behavior may differ across operating systems.
- **Runtime-only obligations:** Environment provisioning/persistence, executable
  provenance, ambient-variable dependencies, secrets, MCP handshake/authentication,
  redirect forwarding, and client extension execution remain unimplemented.

Local read-permission failures and parser resource exhaustion are inspection errors,
not evidence of non-conformant syntax; they produce incomplete results.

Every rule has committed PASS/FAIL fixtures and tests. Additional review tests
cover the corrections, selected-rule dependencies, stable JSON, report counts,
terminal escaping, and optional absences. This review does not claim exhaustive
coverage of all normative client behavior.

# JSON output contracts

JSON version 1 remains the default contract throughout v0.2.x. `--json` is the
documented shorthand for `--format json`; both produce the same v1 bytes for the
same input.

Use `aiconform <directory> --format json` or
`aiconform --list-rules --format json`. The CLI writes exactly one JSON object
and a trailing newline to stdout. JSON usage errors also go to stdout; stderr
is empty for handled errors in JSON mode. `--help` and `--version` always produce
plain text and exit 0. Process-level failures, such as a broken Node installation,
are outside this contract.

The machine-readable JSON Schema (draft 2020-12) is
[schemas/report.schema.json](../schemas/report.schema.json). Installed consumers
can resolve it as `aiagentconform/report.schema.json`. It defines all three output
kinds. It is shipped with the package and does not need a network fetch.

## Compatibility policy

`reportVersion: "1"` is the CLI output contract version, independent of the npm
package version and `specificationVersion`. Within report version 1, existing
field meanings, enum values, types, and required fields will not change.
Breaking output changes require a new report version. The schema is closed to
catch accidental drift; adding fields also requires a new report version.
Rule catalogs can grow, with new stable IDs. IDs are never renumbered or reused.
Consumers must not depend on explanatory prose, exact finding counts, or array
indices. Correcting a rule can legitimately change findings in a patch release.

There are no timestamps, random IDs, colors, or timing measurements. Identical
inputs at the same path on the same filesystem produce identical JSON. Results
and rule catalogs use catalog order, skill entries and server names are sorted,
and findings use deterministic traversal order. Filesystem paths and native path
semantics can differ between hosts.

## `kind: "report"`

| Field | Meaning |
| --- | --- |
| `reportVersion` | `"1"` |
| `kind` | `"report"` |
| `protocol`, `specificationVersion` | `"agent-plugins"`, `"1.0.0"` |
| `target` | Absolute plugin root, filesystem-resolved when accessible |
| `status` | `PASS`, `FAIL`, or `INCOMPLETE`; see exit codes below |
| `selectedRules` | All catalog IDs, or the single ID requested with `--rule` |
| `rulesRun` | Number of selected IDs with at least one evaluated finding |
| `summary` | `passed`/`failed` **finding** counts |
| `ruleSummary` | `total`/`passed`/`failed`/`skipped` **rule** counts |
| `results` | One `{ruleId, status}` per selected ID; status is `PASS`, `FAIL`, or `SKIP` |
| `rules` | Full rule catalog, including metadata for prerequisite findings |
| `findings` | Evaluated findings for selected rules only |
| `prerequisiteFindings` | Failed prerequisite findings, only in selected-rule mode |
| `skipped` | Unevaluated inputs/rules, with location, reason and explanation |
| `advisories` | Separate future quality warnings; currently empty |
| `limitations` | Human-readable scope limits; never parse these to determine status |

Each finding has `ruleId`, `severity` (`PASS` or `FAIL`), `path`, `explanation`,
and `failureBoundary` (`plugin`, `component`, `skill`, `server`, or `field`).
The boundary describes the specified loader impact, not the CLI's exit code.
A non-fatal field violation can still fail a package conformance check.
For AP009, a non-object extension member produces `FAIL` with a member JSON
Pointer and `failureBoundary: "field"`. This is a package-shape finding, not an
instruction to reject a plugin at runtime: clients ignore unimplemented
namespaces, and independent component checks continue. Object contents are
not validated.

A finding's `path` is a display location, usually plugin-relative using `/`,
optionally followed by `#` and a JSON Pointer. Pointer tokens escape `~` as `~0`
and `/` as `~1`. It is not a file URI and should not be used to open a file
without independently validating it. Root lookup errors may use the supplied
argument. Join `ruleId` to `rules[].id` for the title, explanation, category,
and `references[]` entries (`section`, `url`).

Skipped reasons are:

- `not-applicable`: the optional component or relevant entry is absent.
- `prerequisite-failed`: a required document/location/configuration was invalid.
- `client-context-required`: containment needs the client's actual data directory.
- `inspection-error`: local filesystem access or parser resource limits prevented inspection.

If a rule has any failed finding, its result is `FAIL`. Otherwise, blocked or
client-dependent input makes it `SKIP`, even if other inputs passed. Otherwise,
a rule with findings is `PASS`; a rule with no applicable inputs is `SKIP`.
`ruleSummary.total = passed + failed + skipped`.
`summary.passed + summary.failed = findings.length`.
`rulesRun` can include a partially evaluated rule whose final result is `SKIP`.

Overall `FAIL` takes precedence when a selected finding fails. Otherwise,
failed prerequisites or required-but-unevaluated input make it `INCOMPLETE`.
With `--rule`, no applicable input is also `INCOMPLETE`. A full run with only
optional absences can be `PASS`, while honestly counting the absent rules as
skipped. None of these statuses certifies runtime behavior.

## `kind: "rules"`

Contains `reportVersion`, `kind`, `protocol`, `specificationVersion`, and the
full `rules` catalog. It does not require or inspect a plugin directory.
`--list-rules` cannot be combined with a directory or `--rule`.

## `kind: "error"`

Contains `reportVersion`, `kind`, `code` (`CLI_USAGE` or `INTERNAL_ERROR`), and
`message`. It represents an invocation or internal failure, not non-conformance.
The exit code is 2. Stack traces and configuration values are not included.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Full/selected checks passed; or help, version, or rule listing succeeded |
| 1 | At least one selected conformance finding failed |
| 2 | Usage/internal error, or incomplete selected/static check |

For CI, normally treat **any nonzero exit code as a failed gate**. For diagnostic
workflows, distinguish `INCOMPLETE` from `FAIL` using `kind` and `status`.

Generate actual examples from the checkout:

```sh
node dist/cli.js fixtures/agent-plugins/valid --format json
node dist/cli.js fixtures/agent-plugins/invalid/ap006 --format json
node dist/cli.js fixtures/agent-plugins/incomplete/data-cwd --format json
node dist/cli.js --list-rules --format json
```

## JSON report version 2

V2 is available only for package reports:

```sh
aiconform ./plugin --json --report-version 2
```

`--report-version 2` without `--json` is invalid usage and exits 2. In
particular, `--format json --report-version 2` is not an alias for the explicit
v2 opt-in. The closed draft 2020-12 schema is
[schemas/report-v2.schema.json](../schemas/report-v2.schema.json), exported from
the installed package as `aiagentconform/report-v2.schema.json`.

V2 uses `reportVersion: "2"` and contains one catalog-ordered result for every
AP001-AP020 rule. Each has exactly one execution outcome: `passed`, `failed`,
`not_applicable`, `excluded`, or `unable_to_complete`. A reason is always
present. `classification` is separate from outcome; all current AP rules are
normative, and advisory classification does not affect the normative
determination.

Single-rule reports still contain all 20 rules. The selected rule has its actual
outcome and the other 19 are `excluded` with the `--rule` selection reason.
Prerequisite resolution, reads, parsing, and inspection appear in
`inspection.evidence`, not as extra AP rules or inflated pass counts.

The `inspection` object records manifest, standard-skills, and MCP presence and
inspection status; extension namespace names; and MCP server declarations.
Reports state explicitly that extension internals and referenced paths were not
validated, servers were not executed, and endpoints were not contacted.
`executionProblems` records filesystem, parser-resource, client-context, and
prerequisite blockers. `scope` lists limitations and untested capabilities.

Outcome summary counts total 20. `determination` is `pass`, `limited_pass`,
`fail`, or `incomplete`. Excluded rules do not affect exit codes:

| Code | JSON v2 and enhanced terminal meaning |
| --- | --- |
| 0 | Every selected rule passed or was legitimately not applicable |
| 1 | At least one selected rule failed and none was unable to complete |
| 2 | At least one selected rule was unable to complete, or CLI usage failed |

For compatibility, JSON v1 retains failure-first status and exit 1 when a report
contains both a conformance failure and incomplete inspection. Terminal and JSON
v2 instead give `unable_to_complete` precedence and exit 2. This deliberate
v0.2.x exception will be unified when JSON v2 becomes the default in a future
major release.

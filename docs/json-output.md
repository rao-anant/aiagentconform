# JSON output contract, version 1

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

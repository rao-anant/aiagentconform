# AIAgentConform GitHub Action

The repository-root composite Action validates one Agent Plugins package with
`aiagentconform@0.3.0`. It always uses JSON report version 2 internally; report
version is deliberately not an input. The report is uploaded by default before
a conformance failure or incomplete result is propagated to the job.

After v0.3.0 has completed the release procedure, a minimal workflow is:

```yaml
name: Agent Plugin conformance
on:
  pull_request:
  push:
permissions:
  contents: read
jobs:
  conformance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - id: aiconform
        uses: rao-anant/aiagentconform@v0.3.0
        with:
          path: ./plugin
```

`v0.3.0` is a fixed release tag that this project promises never to move. Git
tags are technically mutable, so a reviewed full commit SHA is the strongest
security pin. There is intentionally no moving `v0` tag. Dependabot or another
reviewed update process can propose later fixed versions or SHAs.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Package path relative to `github.workspace` |
| `rule` | empty | Optional exact AP001-AP020 rule ID |
| `upload-report` | `true` | Upload the validated JSON v2 report |
| `artifact-name` | `aiagentconform-report` | Artifact name when upload is enabled |

`path` must be relative. Absolute paths and every explicit `..` segment are
rejected. Existing symbolic links are resolved, including the nearest existing
ancestor of a missing target, so direct and nonexistent-tail symlink escapes are
rejected. A missing path that still resolves inside `github.workspace` is passed
to AP001 instead of being treated as Action input failure.

Inputs are passed to built-in-only Node helpers through environment variables;
they are never interpolated into shell source. The Action installs exactly
`aiagentconform@0.3.0` with npm lifecycle scripts disabled. Its internal
`actions/setup-node` and `actions/upload-artifact` dependencies are pinned to
reviewed full commit SHAs.

## Outputs

| Output | Meaning |
| --- | --- |
| `determination` | `pass`, `limited_pass`, `fail`, or `incomplete` |
| `passed` | Passed-rule count |
| `failed` | Failed-rule count |
| `not_applicable` | Not-applicable-rule count |
| `excluded` | Rule-selection exclusion count |
| `unable_to_complete` | Unable-to-complete-rule count |
| `selected` | Selected-rule count |
| `exit_code` | Validated CLI exit code: 0, 1, or 2 |
| `report_path` | Absolute path to the JSON v2 report on the runner |
| `artifact_name` | Configured artifact name |

For a valid JSON v2 report, the Action writes a job summary for PASS, LIMITED
PASS, FAIL, or INCOMPLETE and preserves CLI exit 0, 1, or 2. Artifact upload
happens before exits 1 or 2 are propagated. The Action does not emit code
annotations or SARIF.

Installation, orchestration, JSON parsing, report validation, summary writing,
and requested artifact-upload failures are integration/tooling errors. They do
not become package FAIL or INCOMPLETE results. When no trustworthy report exists,
conformance outputs are empty and the job summary and log identify the tooling
failure.

## Examples

Run one rule and retain the default report artifact:

```yaml
- id: aiconform
  uses: rao-anant/aiagentconform@v0.3.0
  with:
    path: ./plugin
    rule: AP006
```

Disable artifact upload explicitly:

```yaml
- uses: rao-anant/aiagentconform@v0.3.0
  with:
    path: ./plugin
    upload-report: 'false'
```

The Action performs the same static checks as the CLI. It does not execute
plugin code, start MCP servers, contact declared endpoints, or validate runtime
behavior.

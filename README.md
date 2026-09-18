# AIAgentConform

**Open-source conformance testing for AI agent protocols and standards.**

AIAgentConform is an open-source command-line conformance checker for AI-agent
protocols. Its first module checks **Agent Plugins 1.0.0**: manifests, skills,
MCP configuration, paths, and portable transport settings. Each failure names a
stable rule and links to the official requirement, so authors can fix the
package and CI can explain why it failed.

Agent ecosystems are adopting shared formats, but a JSON file that parses is
not necessarily portable. AIAgentConform combines the official JSON Schemas with
static checks for requirements that schemas alone cannot express. It does not
execute plugins or contact their configured servers.

```text
AIAgentConform - Agent Plugins 1.0
Target: /path/to/plugin
Components:
  Manifest: present (complete)
  Standard skills: present (complete)
  MCP configuration: present (complete)
✓ QUALIFIED PASS - 20 rules passed.
PASS is qualified: static conformance checks do not certify runtime or complete client behavior.
```

**Release status:** v0.3.0 is an unreleased release candidate in this checkout.
Only Agent Plugins 1.0.0 is supported; passing the implemented checks is not
certification of complete package or executing-client conformance.

## GitHub Action

After the v0.3.0 release procedure is complete, add the fixed-version Action to
an Ubuntu workflow:

```yaml
- uses: actions/checkout@v6
- id: aiconform
  uses: rao-anant/aiagentconform@v0.3.0
  with:
    path: ./plugin
```

The Action uses JSON v2 internally and uploads it as `aiagentconform-report` by
default. `v0.3.0` is a fixed tag this project promises never to move, but Git
tags are technically mutable; a reviewed full commit SHA is the strongest
security pin. The project does not publish a moving `v0` tag. See the
[GitHub Action guide](docs/github-action.md) for inputs, outputs, failure
behavior, path security, artifact control, and single-rule examples.

## Install and try it now

Requires Node.js **22.12 or newer** and npm:

```sh
npm install --global aiagentconform@0.1.1
aiconform ./my-plugin

# Or run without a global installation.
npx --yes --package=aiagentconform@0.1.1 aiconform ./my-plugin
```

The npm package is `aiagentconform`; its executable is `aiconform`. Verify the
package owner before using a newly published registry package.

From a checkout of this repository:

```sh
npm ci
npm run build
node dist/cli.js fixtures/agent-plugins/valid
node dist/cli.js fixtures/agent-plugins/invalid/ap006
```

The deliberately invalid example exits 1. For development, `npm link` after
building also exposes `aiconform`. `npm run verify` produces and tests a release
tarball under `.artifacts/`.

## Examples

```sh
aiconform ./my-plugin
aiconform ./my-plugin --format terminal
aiconform ./my-plugin --json > aiconform-report-v1.json
aiconform ./my-plugin --json --report-version 2 > aiconform-report-v2.json
aiconform ./my-plugin --rule AP006
aiconform --list-rules
aiconform --list-rules --format json
aiconform --help
aiconform --version
```

A failure includes the rule, file/location, problem, and specification link:

```text
AIAgentConform - Agent Plugins 1.0
✗ FAIL AP006  plugin.json#/name
  Name must satisfy the official 1–64 character lowercase name constraints.
  Spec: §5.5 https://agent-plugins.org/specification#55-plugin-name-constraints
```

`--rule` accepts one exact, case-sensitive ID. It evaluates that rule and the
prerequisites needed to interpret its inputs, avoiding unrelated component
traversal. Failed prerequisites are reported separately; they never produce a
false pass for the requested rule. `--list-rules` does not inspect files and
cannot be combined with a directory or `--rule`.

Enhanced terminal output says `LIMITED PASS` when one selected rule passes and
reports the other 19 rules as excluded. It never presents that result as an
unqualified full pass.

| Exit code | Meaning |
| --- | --- |
| 0 | Selected rules passed or were legitimately not applicable, or help/version/listing succeeded |
| 1 | At least one selected conformance check failed |
| 2 | Usage/internal error or a selected rule was unable to complete |

JSON v1 deliberately retains its legacy mixed-outcome precedence: a report with
both a conformance failure and incomplete inspection is `FAIL`/exit 1. Enhanced
terminal output and JSON v2 give `unable_to_complete` precedence and exit 2.
This compatibility exception remains in v0.3.0 and will be unified when JSON v2
becomes the default in a future major release.

Full runs allow absent optional components and show their rules as not applicable.
For a selected rule with no applicable input, enhanced terminal and JSON v2
return a limited result with exit 0; JSON v1 retains its legacy `INCOMPLETE` and
exit 2 behavior. A fatal manifest prevents component checks, while isolated
skill/server failures leave independent components checkable. Unknown manifest
fields and a non-object extensions container fail package checks without stopping
otherwise valid components.

Counts refer to distinct rules, not the number of servers or files. The minimal
fixture reports 10 passed and 10 skipped instead of claiming 20 checks ran.
Advisory quality warnings are separate from conformance findings; no advisory
rules are enabled in v0.1.

AP009 checks **package conformance**: each `extensions` member must be an object.
It does not validate fields inside that object. Separately, a conformant client
must ignore namespaces it does not implement without validating their contents.
An AP009 package failure therefore does not mean a client should reject the
plugin; independent component checks continue. See specification §8.1.

## JSON and CLI-based CI

`--json` and `--format json` both emit the unchanged JSON v1 contract by default.
JSON v2 is opt-in only with `--json --report-version 2`; using report version 2
without `--json` is invalid usage. V2 reports every AP001-AP020 outcome and adds
structured inspection, package components, extension namespaces, MCP server
declarations, execution problems, scope limits, and final determination.
See [JSON output documentation](docs/json-output.md) and the
[v1 JSON Schema](schemas/report.schema.json) or
[v2 JSON Schema](schemas/report-v2.schema.json). Use the CLI directly when redirecting
JSON; `npm start` can add npm's own script banners.

For CI after publication, add the pinned package as a devDependency:

```sh
npm install --save-dev aiagentconform@0.1.1
npx --no-install aiconform ./plugin
```

For the composite Action workflow, copy
[examples/aiconform.yml](examples/aiconform.yml) and adjust `./plugin`. The
Action uploads JSON v2 before propagating failure and incomplete exit codes.

## Supported rules

| ID | Check | Official section |
| --- | --- | --- |
| AP001 | Plugin directory and root manifest discovery | §4.1, §5.1 |
| AP002 | Containment of inspected filesystem paths and symlinks | §4.1 |
| AP003 | Manifest JSON object parsing | §5.2 |
| AP004 | Required `$schema` and `name` | §5.3 |
| AP005 | Canonical manifest schema/version | §5.2 |
| AP006 | Plugin name characters, length, and boundaries | §5.5 |
| AP007 | Optional metadata types and closed author object | §5.4 |
| AP008 | Unknown manifest fields, reported and ignored | §5.2 |
| AP009 | Extensions container and member object types; object contents remain opaque | §8.1 |
| AP010 | Fixed component locations, kinds, and valid absence | §6.1–6.2 |
| AP011 | Immediate-child SKILL.md discovery and YAML frontmatter | §7.1; Agent Skills format |
| AP012 | Skill name/directory match, description, optional field constraints | §7.1; Agent Skills frontmatter |
| AP013 | MCP configuration JSON object parsing | §7.2.1 |
| AP014 | Closed MCP document and required fields | §7.2.1 |
| AP015 | Canonical MCP schema/version | §7.2.1 |
| AP016 | Manifest/MCP specification-version consistency | §7.2.2, §10.1 |
| AP017 | Closed transport variants, types, and reserved environment names | §7.2.1, §9.2 |
| AP018 | Stdio executable token and bundled-path containment | §4.1, §7.2.1 |
| AP019 | Working-directory forms and resolvable containment | §4.1, §7.2.1, §9.2 |
| AP020 | Remote endpoint restrictions and literal HTTP headers | §7.2.1 |

## Scope and limitations

- Only local Agent Plugins 1.0.0 packages are checked. There are no separate MCP,
  A2A, AP2, or other protocol modules. MCP configuration checks belong to the
  Agent Plugins package format and do not validate MCP wire behavior.
- There is no runtime execution, sandbox, authentication, handshake, environment
  provisioning, persistence, redirect handling, or deterministic secret detection.
- Cwd containing `${PLUGIN_DATA}` needs the client's actual filesystem. It is
  reported as **INCOMPLETE**, not guessed from a synthetic directory. Placeholders
  in opaque args/env do not require that context. Expansion is single-pass;
  unknown placeholder-like text stays literal.
- Containment covers inspected package paths and existing ancestors. Missing
  command/cwd tails, unused files, runtime races, and executable availability
  are not certified. This tool is not a sandbox for untrusted packages.
- Extension namespace grammar and payload semantics remain unimplemented.
  Skills are discovered only in immediate child directories with a regular,
  exact-case `SKILL.md`. No recursive discovery or missing-skill error is invented.
- Agent Skills naming prose mixes Unicode terminology with ASCII examples.
  AIAgentConform accepts Unicode lowercase letters/numbers. Unknown frontmatter keys
  and an empty Markdown body are not rejected. Bare executable names containing
  whitespace remain a documented portability ambiguity.
- Filesystem behavior is host-dependent. Local verification has been performed on
  Linux with Node 22; a GitHub workflow defines Linux/macOS and Node 22.12/24 checks.
  Windows behavior remains experimental until verified on Windows.

## Specification sources

Rules are grounded in the [official Agent Plugins specification](https://agent-plugins.org/specification)
(version 1.0.0, Published) and its incorporated
[Agent Skills specification](https://agentskills.io/specification). The official
[client checklist](https://agent-plugins.org/client-implementers/conformance)
is non-normative supporting guidance. Schemas are vendored for offline validation;
input files never cause schema downloads.

[SOURCES.md](references/agent-plugins-1.0.0/SOURCES.md) records URLs, review date,
licensing, and version details. [REVIEW.md](references/agent-plugins-1.0.0/REVIEW.md)
records the AP001–AP020 false-positive/false-negative review and ambiguities.

## Development and roadmap

```sh
npm ci
npm run verify        # tests, typecheck, clean build, package/install/CLI checks
npm run test:watch
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding cited, deterministic checks and
[CHANGELOG.md](CHANGELOG.md) for release changes. The next priorities are clarifying
specification ambiguities, broader platform verification, more justified static
coverage, and separately classified advisory rules. See [ROADMAP.md](ROADMAP.md)
for the full direction.

Created by Anant Rao. Contributions welcome.

AIAgentConform code is [MIT licensed](LICENSE). Official schemas retain their
[Apache-2.0 license and attribution](references/agent-plugins-1.0.0/NOTICE.md).

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
✓ 20/20 conformance checks passed
```

**Release status:** v0.1.0 is a local release candidate, not yet published to npm.
Only Agent Plugins 1.0.0 is supported; passing the implemented checks is not
certification of complete package or executing-client conformance.

## Install and try it now

Requires Node.js **22.12 or newer** and npm. From a checkout of this repository:

```sh
npm ci
npm run build
node dist/cli.js fixtures/agent-plugins/valid
node dist/cli.js fixtures/agent-plugins/invalid/ap006
```

The deliberately invalid example exits 1. To install the command from a local
package, or try it through npx:

```sh
npm pack --pack-destination .
npm install --global ./aiagentconform-0.1.0.tgz
aiconform ./my-plugin

# Alternative: use the local tarball without a global installation.
npx --yes --package=./aiagentconform-0.1.0.tgz aiconform ./my-plugin
```

The npm package is `aiagentconform`; its executable is `aiconform`. After a local
installation, `npx aiconform --help` resolves that executable. Outside a project
with it installed, use the explicit `--package` form above to avoid looking up
a different npm package named `aiconform`.

For development, `npm link` after building also exposes `aiconform`.
`npm run verify` produces and tests a release tarball under `.artifacts/`.

After a maintainer publishes this project under its intended npm name, the
planned registry commands are `npm install --global aiagentconform@0.1.0` and
`npx --yes --package=aiagentconform@0.1.0 aiconform ./my-plugin`. **Those are not installation instructions
for the current unpublished checkout.** Always verify the package owner before
using a newly published registry package.

## Examples

```sh
aiconform ./my-plugin
aiconform ./my-plugin --format terminal
aiconform ./my-plugin --format json > aiconform-report.json
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

| Exit code | Meaning |
| --- | --- |
| 0 | Evaluated checks passed, or help/version/listing succeeded |
| 1 | At least one selected conformance check failed |
| 2 | Usage/internal error or incomplete check, including unavailable client context |

Full runs allow absent optional components and show their rules as skipped.
A selected rule with no applicable input exits 2. A fatal manifest prevents
component checks, while isolated skill/server failures leave independent
components checkable. Unknown manifest fields and a non-object extensions
container fail package checks without stopping otherwise valid components.

Counts refer to distinct rules, not the number of servers or files. The minimal
fixture reports 10 passed and 10 skipped instead of claiming 20 checks ran.
Advisory quality warnings are separate from conformance findings; no advisory
rules are enabled in v0.1.

## JSON and CI

JSON output has a versioned, documented contract with structured findings,
rule metadata, specification URLs, prerequisite failures, and skip reasons.
See [JSON output documentation](docs/json-output.md) and the
[JSON Schema](schemas/report.schema.json). Use the CLI directly when redirecting
JSON; `npm start` can add npm's own script banners.

To use the local release candidate in a plugin repository, copy the reviewed
tarball into a directory such as `tools/`, then install it as a devDependency:

```sh
npm install --save-dev ./tools/aiagentconform-0.1.0.tgz
npx --no-install aiconform ./plugin
```

Commit the tarball, `package.json`, and `package-lock.json` in that repository.
Copy [examples/aiconform.yml](examples/aiconform.yml) to
`.github/workflows/aiconform.yml` and adjust `./plugin`. Its check step propagates
both failure and incomplete exit codes to GitHub Actions; it does not hide errors
with `continue-on-error`. After publication, a pinned registry devDependency can
replace the tarball without changing the check command.

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
| AP009 | Extensions container; unimplemented values remain opaque | §8.1 |
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
[CHANGELOG.md](CHANGELOG.md) for v0.1.0 changes. The next priorities are clarifying
specification ambiguities, broader platform verification, more justified static
coverage, and separately classified advisory rules. See [ROADMAP.md](ROADMAP.md)
for the full direction.

Created by Anant Rao. Contributions welcome.

AIAgentConform code is [MIT licensed](LICENSE). Official schemas retain their
[Apache-2.0 license and attribution](references/agent-plugins-1.0.0/NOTICE.md).

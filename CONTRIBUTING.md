# Contributing to AIAgentConform

AIAgentConform turns cited protocol requirements into deterministic, inspectable
checks. Contributions should reduce uncertainty without inventing requirements.
The current module is Agent Plugins 1.0.0; new protocols and runtime execution
are outside the v0.1 scope.

## Local development

Use Node.js 22.12 or newer and npm:

```sh
npm ci
npm run verify
```

`verify` runs Vitest, typecheck, a clean build, npm packing, an isolated tarball
installation, and CLI checks. The installation may require npm registry access.
It leaves the reviewed tarball under `.artifacts/` and removes its temporary
installation. It never publishes or runs plugin code. Use `npm test` or
`npm run test:watch` for faster feedback while editing.

## Contribute a conformance rule

1. Read the current official normative specification and the relevant conformance
   requirements. Record the exact version, URL, section, and review date in
   `references/`. Check whether the requirement applies to a package, a loader,
   or a running client. Identify MUST versus SHOULD and optional components.
2. Explain the concrete false positive, false negative, or missing check. Include
   valid counterexamples and document ambiguity. Do not turn SemVer, SPDX, prose
   quality, or recommended layouts into mandatory package requirements.
3. Add an explicitly numbered stable ID to
   `src/protocols/agent-plugins/rules.ts`. Never renumber existing IDs or reuse a
   removed ID. Metadata needs a title, human-readable explanation, conformance
   category, and official section URLs. Add the intended check to the README.
4. Implement the check in the protocol module. Use the vendored schema when
   applicable; normative prose wins over schema bugs. Do not fetch a schema
   named by an input file, execute a command, or connect to a server. Keep
   extension object contents opaque and arguments/env values separate from paths.
   AP009 checks container/member object types for package conformance; this is
   distinct from the client requirement to ignore unimplemented namespaces.
5. Preserve failure isolation. Return PASS/FAIL findings through `Evaluation`,
   with a location and the narrowest specified loader boundary. If a prerequisite
   or client context is unavailable, use an explicit skip instead of a guessed
   result. Update prerequisite handling and traversal gates so `--rule` does
   not inspect unrelated component types. Advisory warnings belong separately
   in `advisories`, never in conformance failures.
6. Add committed valid and deliberately-invalid fixtures plus tests. Test both
   sides of the boundary, optional absence, prerequisites, and independent valid
   components. Filesystem checks need contained and escaping symlinks, including
   symlink-before-`..` cases. Never execute fixture scripts. Temporary resources
   belong under the test's temporary directory and must be cleaned up.
7. Update `docs/json-output.md` and its schema only if the output contract must
   change. Breaking field/type/enum changes require a new report version.
   Explanatory text may change, but IDs and field meanings are stable. Check
   terminal output and JSON against fixtures, including selected-rule runs.
8. Update `CHANGELOG.md`, the rule review notes, and relevant limitations. Run
   `npm run verify` before proposing the change.

## Pull requests

Describe the input that failed before, the resulting behavior, the official
requirement, and validation performed. Explain any interpretation decisions or
unimplemented cases. Keep each pull request focused. Screenshots are optional;
fixture inputs and expected findings are more useful for reviewing rules.

The GitHub workflow defines Linux/macOS checks on the minimum supported Node
version and Node 24. A local run does not establish that the hosted matrix passed.
Windows filesystem behavior remains experimental until verified on Windows.

## Licensing

New project code uses the repository's MIT license. Preserve Apache-2.0 notices
for upstream schemas and CC BY 4.0 attribution for specification documentation.
Do not change a vendored schema silently: record its source and checksum, and
put any normative override in an explained, regression-tested code path.

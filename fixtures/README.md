# Fixtures

`agent-plugins/valid` exercises all 20 rules and all three transport configuration
variants. It intentionally includes metadata that must not be rejected merely
for failing SemVer, URL, email, or SPDX recommendations. Its tool is never run.

`agent-plugins/minimal` contains only the two required manifest fields.

`agent-plugins/invalid/ap001` through `ap020` each trigger the corresponding
rule. Some also trigger dependent failures. AP002 uses a relative symlink to a
manifest outside its package root; preserve symlinks when copying the fixtures.
Missing manifests are represented by a README so the directory survives git.

Tests create additional temporary packages for symlink escapes and failure
isolation. They never execute scripts or connect to MCP servers.

`agent-plugins/incomplete/data-cwd` requires the client-managed data filesystem.
It exits 2 rather than guessing a containment result. The AP019 invalid fixture
uses a resolvable plugin-root escape; the complete valid fixture uses data
placeholders only in opaque args/env, not in cwd.

`agent-plugins/invalid/ap009-member` fails package conformance because its
extension member is not an object. It complements the non-object container
fixture at `invalid/ap009`; namespace object contents are not validated.

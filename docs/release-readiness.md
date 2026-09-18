# v0.3.0 release readiness

v0.3.0 adds the repository-root composite GitHub Action and npm package version
used by that Action. Do not create a tag, GitHub release, or npm publication
until the release candidate has completed the procedure below.

Before a maintainer makes a public release:

- Original author attribution is recorded as Anant Rao. The canonical repository
  is https://github.com/rao-anant/aiagentconform; `repository`, `homepage`, and `bugs`
  metadata are configured. GitHub authentication and the initial source push
  were completed.
- Confirm npm publishing access for the existing `aiagentconform` package and
  require two-factor authentication according to the maintainer's npm policy.
- Run the committed GitHub matrix in the eventual public repository. Local
  verification cannot establish hosted Linux/macOS results or Windows support.
- Review the documented static coverage, especially command portability limits
  and client-data cwd checks that return INCOMPLETE. Do not advertise exhaustive
  client conformance or runtime security guarantees.
- Confirm JSON v1 compatibility against commit `f9570ea` and validate emitted JSON v2 reports against
  `schemas/report-v2.schema.json`. The v2 package export is
  `aiagentconform/report-v2.schema.json`; the existing v1 export is unchanged.
- Review the deliberate v0.2.x exit-code exception: mixed failure/incomplete is
  exit 1 in JSON v1 and exit 2 in terminal/JSON v2.
- Set the release date in CHANGELOG.md only when release actually occurs, and
  change README registry-install examples from planned to available only after
  the correct package has been published.

Package preparation includes a bin entry, executable build, version/engine/license,
explicit file allowlist, discoverability keywords, local JSON schema export,
upstream notices, and public-registry publish configuration. A `prepublishOnly`
script runs verification as a guard for a future maintainer-initiated publish;
it does not itself publish. No publish or push command is part of verification.

`npm run verify` leaves a reviewed local tarball in `.artifacts/`. That tarball
can be installed and used by CI today without a registry release. Review its
contents and checksums before distribution.

## Exact v0.3.0 release procedure

The order is mandatory because the committed Action installs the public npm
package and cannot be tested externally until that exact package exists:

1. Commit the fully verified release candidate and push that commit to `main`.
2. Publish exactly `aiagentconform@0.3.0` to npm, then install it in a clean
   directory and verify its version, CLI, JSON contracts, schema exports, and
   upstream notice/license files.
3. From a separate public consumer repository, invoke the committed Action by
   its full 40-character commit SHA and verify the complete pass, failure,
   incomplete, mixed, and single-rule paths against public npm. A full commit SHA
   is the strongest security pin.
4. Only after that external test succeeds, create annotated tag `v0.3.0` at the
   tested commit, push that tag, and create the GitHub release for `v0.3.0`.

The corresponding maintainer commands are intentionally separate and ordered:

```sh
git commit -m "Add v0.3.0 GitHub Action"
git push origin main

npm publish
npm view aiagentconform@0.3.0 version dist.integrity

# Run the external full-SHA consumer workflow here and require it to pass.

git tag -a v0.3.0 -m "AIAgentConform v0.3.0"
git push origin v0.3.0
gh release create v0.3.0 --verify-tag --generate-notes
```

The project promises never to move the fixed `v0.3.0` tag after publication,
although Git tags are technically mutable. Do not create a moving `v0` tag.

Repository metadata now targets `rao-anant/aiagentconform`. Historical Git
commit messages and reflogs retain the previous project name intentionally.

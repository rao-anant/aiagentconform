# v0.2.0 release readiness

This checkout contains unreleased v0.2.0 implementation work. No npm package,
tag, or GitHub release has been created for v0.2.0. v0.1.1 remains the published
release.

Before a maintainer makes a public release:

- Original author attribution is recorded as Anant Rao. The canonical repository
  is https://github.com/rao-anant/aiagentconform; `repository`, `homepage`, and `bugs`
  metadata are configured. GitHub authentication and the initial source push
  were completed.
- Confirm npm account ownership and availability of the new package name
  `aiagentconform`. Previous registry checks for the old name do not establish
  availability or publishing rights for the new name.
- Run the committed GitHub matrix in the eventual public repository. Local
  verification cannot establish hosted Linux/macOS results or Windows support.
- Review the documented static coverage, especially command portability limits
  and client-data cwd checks that return INCOMPLETE. Do not advertise exhaustive
  client conformance or runtime security guarantees.
- Confirm JSON v1 compatibility and validate emitted JSON v2 reports against
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

Repository metadata now targets `rao-anant/aiagentconform`. Historical Git
commit messages and reflogs retain the previous project name intentionally.

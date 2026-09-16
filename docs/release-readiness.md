# v0.1.0 release readiness

This checkout is a release candidate. No package, release, branch, or tag has
been published or pushed by the implementation work.

Before a maintainer makes a public release:

- Original author attribution is recorded as Anant Rao. The canonical repository
  is https://github.com/rao-anant/agentcheck; `repository`, `homepage`, and `bugs`
  metadata are configured. GitHub authentication and the initial push remain
  to be completed.
- Confirm npm account ownership and the final package name/scope. A read-only
  registry lookup for `agentcheck` returned 404 on 2026-09-10 local time; that
  does not reserve the name or establish publish permission.
- Run the committed GitHub matrix in the eventual public repository. Local
  verification cannot establish hosted Linux/macOS results or Windows support.
- Review the documented static coverage, especially extension/command ambiguities
  and client-data cwd checks that return INCOMPLETE. Do not advertise exhaustive
  client conformance or runtime security guarantees.
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

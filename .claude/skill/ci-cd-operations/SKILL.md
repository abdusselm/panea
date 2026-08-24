# Skill: releasing panea (commit, version, changelog, tag, tap)

Every commit that changes shipped code is a release. Follow this file whenever
you commit, bump a version, tag, or package. No step is optional, and the order
matters: the version lands in `package.json` **in the same commit** as the code,
because the tag is cut from that commit and the Homebrew formula is built from
that tag.

## 1. Bump the version by one

`package.json` `version` goes up by exactly **one patch** per commit:

```
0.2.0 → 0.2.1 → 0.2.2 → …
```

- **Patch +1 is the default.** Use it for fixes, additions, refactors,
  docs-in-code — anything that does not break how the app is invoked or
  configured.
- **Minor +1** (`0.2.7 → 0.3.0`) only when a release changes behaviour a user
  would notice as new: a new pane/tab capability, a new flag, a changed
  keybinding.
- **Major +1** only on a break: a removed flag, a moved state directory, a
  config file that stops being read.

One commit, one version. Never bundle two features under one bump, and never
commit shipped code without a bump.

**Repo-only files do not ship and get no bump**: `CLAUDE.md`, `.claude/`,
`README.md`, `CONTRIBUTING.md`, `.github/`. Nothing in the `files` array of
`package.json` means nothing in the tarball. Commit those on their own, with no
version change and no changelog entry.

Nothing else stores the version — `bin/panea.js`, `electron/main.cjs`, and
`scripts/update-tap.mjs` all read `package.json`. Do not hardcode it anywhere.

## 2. Write the commit message as a summary

Conventional-commit subject, then a short body. **Summary, not a transcript** —
what changed and why it mattered, not a list of every edited line.

```
<type>(<scope>): <imperative subject, lowercase, no trailing period>

<1–3 sentences: the symptom a user hit, and what now happens instead.>
```

- `type`: `fix`, `feat`, `perf`, `refactor`, `test`, `docs`, `chore`, `build`.
- `scope`: the module that owns the change — `pane`, `update`, `ws`, `tabs`,
  `palette`, `meta`, `electron`, `brew`.
- Subject ≤ 72 chars. Body wrapped at 80.
- The body explains **cause and consequence**. `CLAUDE.md` forbids comments in
  the code, so rationale lives here — assume this is the only place it is
  written down.
- Never add a `Claude-Session:` trailer. This repo is public.

Good:

```
fix(update): restart through the linked binary, not the keg being replaced

The self-update relaunched process.argv[1], which points inside the old
Cellar keg that brew upgrade then deletes, so the upgrade succeeded and the
relaunch died with MODULE_NOT_FOUND. It now runs the brew-linked binary,
which already points at the new version.
```

Bad: `fix: bug fix`, `update files`, `wip`, a bullet list of touched files.

## 3. Update CHANGELOG.md in the same commit

Add a section at the top, under the intro, above the previous release:

```markdown
## [<version>] - <YYYY-MM-DD>

### Fixed | Added | Changed | Removed

- <One entry per user-visible change. Say the symptom first, then the fix.>
```

- Sections in that order; omit any that is empty.
- Entries are **prose summaries a user can act on**, not commit subjects. State
  what went wrong, then what happens now.
- Internal-only work (tests, refactors with no behaviour change) gets **no**
  entry. Bump the version, skip the changelog.
- Date is the actual release date, ISO format.

## 4. Verify before committing

```bash
npm test
```

All tests must pass. A behaviour change needs a test in `tests/` in the same
commit. If the change touched symbols or files, refresh the knowledge graph
(`build_or_update_graph_tool`) before finishing.

## 5. Commit, tag, push

```bash
git add -A
git commit -m "<subject>" -m "<body>"
git tag v<version>
git push origin main --follow-tags
```

The tag is always `v` + the exact `package.json` version. Tag and commit are
never separated — a tag on the wrong commit ships the wrong tarball, because
Homebrew fetches
`https://github.com/abdusselm/panea/archive/refs/tags/v<version>.tar.gz`.

## 6. Let the workflow publish the release, then write real notes

`.github/workflows/release.yml` fires on every `v*` tag. It reruns the tests,
**fails the release if the tag does not match `package.json`**, checks the
tarball carries no shell history, and runs `gh release create --generate-notes`.

So do **not** run `gh release create` yourself — it returns
`HTTP 422: Release.tag_name already exists`. Wait for the run, then replace the
generated notes with the changelog section:

```bash
gh run list --limit 3
gh release edit v<version> --notes "<the CHANGELOG section body>"
```

This matters because `server/update.js` polls
`https://api.github.com/repos/abdusselm/panea/releases/latest` and compares
`tag_name` to the running version. **No release, no update reaches anyone**, and
a red workflow means no release. Prerelease tags are refused by `isNewer` on
purpose — never mark a release prerelease unless nobody should receive it.

## 7. Update the Homebrew tap

The workflow only *prints* the tarball checksum; pushing the formula is manual.

```bash
PANEA_TAP_PUSH=1 node scripts/update-tap.mjs
```

`scripts/update-tap.mjs` downloads the tag tarball, hashes it, rewrites
`Formula/panea.rb` in the sibling `homebrew-tap` checkout (`PANEA_TAP` to point
elsewhere), and pushes. Run it **after** the tag is on GitHub — it hashes the
published tarball, and a missing tag fails the fetch. Until this runs, nobody's
`brew upgrade` finds the new version, however green the release is.

## 8. What users then see

There is no in-app update banner and no version in the UI. The whole mechanism
is `bin/panea.js` calling `maybeSelfUpdate` on launch:

- Homebrew kegs only (`detectInstall`); a git checkout never self-updates.
- At most one check per 6 hours (`~/.panea/update-check.json`).
- On a newer release: `brew update`, `brew upgrade --formula panea`, then the
  process relaunches itself with `PANEA_UPDATED=1`.
- Opt out with `--no-update` or `PANEA_NO_UPDATE=1`.

So a broken tag, an unpushed tag, or a missing GitHub release is silent — the
user simply never updates. Verify with `panea --version` on a Homebrew install
after a release.

## Checklist

1. `package.json` version +1
2. Commit message: type(scope) subject + summary body, no session trailer
3. `CHANGELOG.md` section for the new version
4. `npm test` green, tests added for behaviour changes
5. `git commit` + `git tag v<version>` + `git push --follow-tags`
6. Workflow goes green, then `gh release edit v<version> --notes …`
7. `npm run tap` with `PANEA_TAP_PUSH=1`

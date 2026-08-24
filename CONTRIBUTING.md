# Contributing to panea

Thanks for taking a look. panea is small on purpose — one responsibility per
module, no build step, no framework — and the goal is to keep it that way.

## Getting set up

```bash
git clone https://github.com/abdusselm/panea.git
cd panea
npm install
npm run app     # desktop window
npm start       # browser build -> http://127.0.0.1:4820
npm test        # unit tests
```

macOS only, Node 18+. `npm install` runs `scripts/brand-dev-electron.mjs`, which
renames the Electron bundle in `node_modules` so the app presents itself as
Panea; it restarts the Dock once, which is expected.

Nothing compiles. Edit a file, reload the window.

## House rules

**No comments.** Not in JavaScript, CSS, Python, or shell. Name things well and
structure the code so it reads without them. Explanations belong in the commit
message, the README, or `CLAUDE.md`. A patch that adds comments will be asked to
remove them.

**One responsibility per module.** A new feature gets a new file rather than
being appended to an existing one — a `public/js/<feature>.js` and a matching
`public/css/<feature>.css`, or a `server/<feature>.js`. `public/style.css` only
`@import`s; it never grows rules of its own.

**Be a resource miser.** panea hosts many live terminals at once. Never spawn a
child process per pane (snapshot once, see `server/meta.js`), coalesce hot DOM
work into one `requestAnimationFrame`, patch nodes in place instead of
rebuilding them, debounce writes to disk, and cancel every timer and observer on
teardown.

**Do not touch the user's dotfiles.** The shell theme is layered through a
`ZDOTDIR` shim in `shell/zsh/`, and it must stay opt-out via `PANEA_NO_THEME=1`.

**No self-built native binaries.** panea runs on the stock Node runtime and the
Apple-signed system `python3`, so it works on machines that refuse unsigned
binaries. That rules out `node-pty` and anything else that ships its own
compiled helper.

## Security

The WebSocket bridge hands out a real login shell, so it only ever binds
`127.0.0.1` and only accepts loopback `Origin` and `Host` values — see
`server/origin.js` and the tests in `tests/origin.test.js`. If you change how
connections are accepted, say so explicitly in the pull request.

Please report anything exploitable privately through
[GitHub security advisories](https://github.com/abdusselm/panea/security/advisories/new)
rather than in a public issue.

## Pull requests

- Branch off `main`, one topic per pull request.
- Run `npm test` before pushing. Add tests for anything with real logic.
- Conventional commit subjects: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`.
- Explain *why* in the commit body. That is where reasoning lives, since the
  code carries no comments.
- Say what you actually ran to verify it. "Opened four panes, split twice,
  restarted" is worth more than "works".

## Releasing

Maintainers only. Bump the version, tag it, and let CI publish:

```bash
npm version minor      # or patch / major
git push --follow-tags
```

The `release` workflow tests the tag, creates the GitHub release, and prints the
sha256 for the Homebrew formula. Then point the tap at it:

```bash
PANEA_TAP_PUSH=1 node scripts/update-tap.mjs
```

That rewrites `Formula/panea.rb` in a sibling `homebrew-tap` checkout (override
the location with `PANEA_TAP`) and pushes it.

The same workflow also publishes to npm, but only if an `NPM_TOKEN` secret
exists; without one it simply skips that step.

Installed copies pick a release up on their next launch, so treat every release
as something that lands on other people's machines without being asked for.

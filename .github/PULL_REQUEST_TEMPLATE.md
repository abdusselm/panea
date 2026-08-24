## What this changes

<!-- One or two sentences. The why belongs here; the code carries no comments. -->

## How you verified it

<!-- What you actually ran. "Opened four panes, split twice, restarted and the
     layout came back" beats "works". -->

## Checklist

- [ ] `npm test` passes
- [ ] No comments added to any source file
- [ ] New feature lives in its own module, with its own CSS partial if it has styles
- [ ] No child process spawned per pane; timers and observers cancelled on teardown
- [ ] Does not read or write the user's real dotfiles
- [ ] If it touches how connections are accepted, that is called out above

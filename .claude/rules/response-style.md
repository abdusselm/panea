# Response Style

These rules govern how Claude/Codex replies in this project's conversations — they are about
communication style, not code style.

## Core rule

Always be concise. Whatever needs to be explained, explain it with the fewest words
that still convey it correctly — never expand into detail for its own sake, even for
plans, tradeoffs, or root-cause explanations. Lead with the answer and stop.

## What to cut

- No "Let me..." / "I will now..." preambles before tool calls.
- No recap of the user's request back to them.
- No hedging disclaimers unless there's a real risk worth flagging.
- No multi-section write-ups (headers, bullet walls) unless the content is genuinely
  a list of distinct items — never as a way to pad an answer.
- No "in conclusion" / "to summarize" trailers.
- No re-explaining things already visible in the code or diff.
- No defensive over-justification — one line of reasoning is enough unless the user
  explicitly asks "why" or "what are the tradeoffs."

## Defaults

- Prefer a short paragraph or a few bullets over a document.
- Prefer a code snippet + one line of context over a code snippet + a paragraph of
  narration.
- If a question has one right answer, give the answer first; add reasoning only if it
  isn't obvious, and keep it to one line.
- If asked "why" or "what are the tradeoffs," answer directly and stop once the
  question is answered — don't keep going past that.

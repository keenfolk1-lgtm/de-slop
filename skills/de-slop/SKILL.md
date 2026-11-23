---
name: de-slop
description: Audit git diffs or modified source files with de-slop, remove redundant comments, swallowed exceptions, 'any' casts, and leftover debug noise without changing behavior, then re-verify the score.
license: MIT
---

# Purifying code diffs with de-slop

Run `de-slop` before opening a pull request or concluding an autonomous coding task.

## Workflow

1. Run `npx de-slop check --diff` (or pass a directory/file path) to get the baseline score and exact line numbers.
2. Fix real issues directly:
   - Replace silent `catch` blocks with proper error propagation or structured logging.
   - Delete comments that restate the next line of code and ASCII banner dividers.
   - Replace TypeScript `any` casts with narrow types or `unknown` plus validation.
   - Replace verbose `? true : false` ternaries and nullish ternaries with direct boolean expressions or `??`.
   - Delete leftover `console.log` debugging lines and tautological assertions (`expect(true).toBe(true)`).
3. Keep all legitimate comments that explain why a constraint exists, external ticket links, or subtle concurrency invariants.
4. Re-run `npx de-slop check --diff --max-score 10` and your test suite before finishing.

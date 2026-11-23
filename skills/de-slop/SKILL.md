---
name: de-slop
description: Audit git diffs or modified source files with de-slop, remove redundant comments, swallowed exceptions, 'any' casts, and leftover debug noise without changing behavior, then re-verify the score.
license: MIT
---

# Purifying code diffs with de-slop

Run `de-slop` before opening a pull request or concluding an autonomous coding task.

## Workflow

1. Run `npx -y github:keenfolk1-lgtm/de-slop check --diff` (or pass `--exclude` / `.deslopignore` for generated code) to get the baseline score and exact line numbers.
2. Fix real issues directly:
   - Replace silent `catch` / `except:` / swallowed Go `err != nil { return nil }` blocks with proper error handling, or document a genuine non-fatal fallback with a specific comment.
   - Delete comments that restate the next line of code and ASCII banner dividers.
   - Replace TypeScript `any` casts and unreasoned `@ts-ignore` pragmas with narrow types or `@ts-expect-error` plus an explanation.
   - Remove unnecessary `async` modifiers on synchronous functions, verbose `? true : false` ternaries, and nullish ternaries (`??`).
   - Delete leftover debug prints and tautological assertions (`expect(true).toBe(true)`).
3. Use `// de-slop-ignore` only for rare intentional cases, and keep comments that explain why a constraint exists.
4. Re-run `npx -y github:keenfolk1-lgtm/de-slop check --diff --max-score 10` and your test suite before finishing.

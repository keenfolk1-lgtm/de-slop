const COMMENT_PREFIX_RX = /^\s*(?:\/\/|#)\s*(.+)$/;
const GENERIC_IGNORE_COMMENT_RX = /^(?:ignore|ignored|swallow|swallowed|todo|noop|empty|skip|pass)\s*[.!]*$/i;
const WHY_COMMENT_RX = /\b(?:because|workaround|until|legacy|prevents|avoids|since|fallback|due\s+to)\b/i;
const PRAGMA_COMMENT_RX = /^(?:\d+\.\s+|eslint-disable|@ts-expect-error|@ts-ignore|nolint|noqa|type:|de-slop-ignore)/i;

function isTestFile(relPath) {
  return /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[a-z]+$|_test\.(?:go|py|rs)$|^test_/.test(
    String(relPath || "").replace(/\\/g, "/")
  );
}

function isCliEntry(relPath) {
  return /(?:^|\/)(?:bin|scripts)\/|^(?:cli|bin)\./i.test(String(relPath || "").replace(/\\/g, "/"));
}

function isSubstantiveComment(commentInner) {
  const cleaned = String(commentInner || "")
    .replace(/^\/\/\s*|^\/\*\s*|\s*\*\/$/g, "")
    .trim();
  if (!cleaned) return false;
  if (GENERIC_IGNORE_COMMENT_RX.test(cleaned)) return false;
  return cleaned.length >= 20;
}

export const SLOP_RULES = [
  { id: "comment-restates-code", weight: 7, message: "Comment literally restates the next line of code", suggestion: "Delete the redundant comment unless it explains why a constraint exists." },
  { id: "empty-or-swallowed-catch", weight: 14, message: "Empty or silently swallowed catch/except block", suggestion: "Log/rethrow the error or add an explanatory comment describing why ignoring it is safe." },
  { id: "redundant-else-after-return", weight: 6, message: "Redundant else block immediately after return/throw", suggestion: "Unindent the else branch using an early return." },
  { id: "any-escape-hatch", weight: 9, message: "TypeScript 'any' escape hatch weakens type safety", suggestion: "Replace 'any' with a narrow type or 'unknown' plus validation." },
  { id: "console-debug-leftover", weight: 6, message: "Leftover debug print statement", suggestion: "Remove temporary console.debug/log debug calls before committing." },
  { id: "banner-divider-noise", weight: 5, message: "ASCII banner comment divider noise", suggestion: "Remove decorative repeated-character dividers." },
  { id: "apologetic-todo-slop", weight: 15, message: "Placeholder/apologetic AI TODO comment", suggestion: "Finish the implementation or track a real issue instead of leaving placeholder text." },
  { id: "tautological-test", weight: 18, message: "Tautological assertion that always passes", suggestion: "Assert real function output against expected values." },
  { id: "boolean-ternary-noise", weight: 7, message: "Redundant ternary returning boolean literal (? true : false)", suggestion: "Use Boolean(cond) or the comparison expression directly." },
  { id: "narrating-docstring", weight: 6, message: "Docstring repeats parameter or function name with no extra contract", suggestion: "Drop filler JSDoc tags or document non-obvious invariants." },
  { id: "ai-prose-in-code", weight: 8, message: "AI prose phrasing inside code comment", suggestion: "Replace filler phrasing with plain technical terms." },
  { id: "high-comment-ratio", weight: 10, message: "Over-commented file (>45% comment lines)", suggestion: "Trim obvious inline narration comments." },
  { id: "redundant-null-fallback", weight: 7, message: "Verbose nullish check instead of ?? operator", suggestion: "Simplify to val ?? fallback." },
  { id: "trivial-passthrough-wrapper", weight: 8, message: "Trivial one-line passthrough wrapper function", suggestion: "Call or export the underlying function directly." },
  { id: "ts-ignore-without-reason", weight: 10, message: "@ts-ignore or @ts-nocheck without an explanation", suggestion: "Fix the type error or use @ts-expect-error with a clear reason." },
  { id: "python-bare-except", weight: 12, message: "Python bare 'except:' catches KeyboardInterrupt and SystemExit", suggestion: "Catch a specific exception class (e.g. except ValueError as err:)." },
  { id: "go-swallowed-error", weight: 12, message: "Go error check returns nil or has an empty block", suggestion: "Return or wrap the error instead of discarding it." },
  { id: "async-without-await", weight: 8, message: "Short async function contains no await expression", suggestion: "Remove the unnecessary async modifier or await the async call." }
];

const STOP_VERBS = new Set(["the", "a", "an", "to", "for", "of", "in", "on", "this", "that", "next", "with", "from", "by"]);

function extractTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_VERBS.has(w));
}

export function detectFileSlop(relPath, content, allowedLines = null) {
  const findings = [];
  const lines = String(content || "").split(/\r?\n/);
  const normRel = String(relPath || "").replace(/\\/g, "/");
  const checkLine = (ln) => {
    if (allowedLines && !allowedLines.has(ln)) return false;
    const cur = lines[ln - 1] || "";
    const prev = lines[ln - 2] || "";
    if (/de-slop-ignore/i.test(cur) || /de-slop-ignore/i.test(prev)) return false;
    return true;
  };
  const add = (ruleId, line, snippet, detail) => {
    if (!checkLine(line)) return;
    const rule = SLOP_RULES.find((r) => r.id === ruleId);
    findings.push({
      ruleId,
      weight: rule ? rule.weight : 5,
      file: normRel,
      line,
      message: detail || (rule ? rule.message : ruleId),
      suggestion: rule ? rule.suggestion : "",
      snippet: String(snippet || "").trim().slice(0, 120)
    });
  };

  let commentLines = 0;
  let nonEmptyLines = 0;
  const isGo = /\.go$/i.test(normRel);
  const isPy = /\.py$/i.test(normRel);
  const isTs = /\.(?:ts|tsx)$/i.test(normRel);
  const isJsTs = /\.(?:js|mjs|cjs|ts|tsx|jsx)$/i.test(normRel);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const ln = i + 1;
    if (!trimmed) continue;
    nonEmptyLines++;

    const isComment = /^\s*(?:\/\/|#|\/\*|\*)/.test(line);
    if (isComment) commentLines++;

    // 1. banner-divider-noise
    if (/^\s*(?:\/\/|#)\s*[-=*_~]{12,}/.test(line)) {
      add("banner-divider-noise", ln, line);
    }

    // 2. apologetic-todo-slop
    if (/(?:\/\/|#|\/\*|\*)\s*.*\b(?:TODO:\s*(?:implement|handle|add)|placeholder\s+for\s+now|simplified\s+for\s+brevity|left\s+as\s+an\s+exercise|rest\s+of\s+(?:the\s+)?(?:code|implementation)|in\s+a\s+real\s+app(?:lication)?)\b/i.test(line)) {
      add("apologetic-todo-slop", ln, line);
    }

    // 3. ai-prose-in-code
    if (isComment && /\b(?:delve|leverage|robust|seamless|seamlessly|comprehensive|crucial|pivotal|note\s+that\s+this|here\s+we\s+(?:define|create|handle|ensure))\b/i.test(line)) {
      add("ai-prose-in-code", ln, line);
    }

    // 4. comment-restates-code (with pragma & why-comment exemptions)
    const cm = line.match(COMMENT_PREFIX_RX);
    if (cm && !/[-=*_~]{8,}/.test(cm[1]) && !PRAGMA_COMMENT_RX.test(cm[1]) && !WHY_COMMENT_RX.test(cm[1])) {
      const nextLine = lines[i + 1] || "";
      const nextTrimmed = nextLine.trim();
      if (nextTrimmed && !/^\s*(?:\/\/|#)/.test(nextLine)) {
        const cTokens = extractTokens(cm[1]);
        const codeTokens = new Set(extractTokens(nextTrimmed));
        if (cTokens.length >= 2 && cTokens.length <= 7) {
          const overlap = cTokens.filter((t) => codeTokens.has(t)).length;
          if (overlap / cTokens.length >= 0.65) {
            add("comment-restates-code", ln, `${trimmed} -> ${nextTrimmed}`);
          }
        }
      }
    }

    // 5. narrating-docstring
    if (/\*\s*@param\s+\{?[^}\s]*\}?\s+([A-Za-z0-9_]+)\s+(?:the\s+)?\1\.?\s*$/i.test(trimmed)) {
      add("narrating-docstring", ln, line);
    }

    // 6. any-escape-hatch
    if (isTs && /(:\s*any\b|\bas\s+any\b|<any>)/.test(line) && !isComment) {
      add("any-escape-hatch", ln, line);
    }

    // 7. ts-ignore-without-reason
    if (isJsTs) {
      const tsIg = line.match(/\/\/\s*@(?:ts-ignore|ts-nocheck)\b(.*)$/);
      if (tsIg && tsIg[1].trim().length < 12) {
        add("ts-ignore-without-reason", ln, line);
      }
    }

    // 8. console-debug-leftover (skip CLI entrypoints/tests, focus on debug calls)
    if (
      !isTestFile(normRel) &&
      !isCliEntry(normRel) &&
      !isComment &&
      /\b(?:console\.debug\s*\(|console\.log\s*\(\s*(?:['"`](?:DEBUG|debug|here|test|trace)\b|\{)|dbg!\s*\(|print\s*\(\s*f?['"]DEBUG)/i.test(line)
    ) {
      add("console-debug-leftover", ln, line);
    }

    // 9. boolean-ternary-noise
    if (!isComment && /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/.test(line)) {
      add("boolean-ternary-noise", ln, line);
    }

    // 10. redundant-null-fallback
    if (!isComment && /\b([A-Za-z0-9_.]+)\s*!==\s*(?:null|undefined)\s*&&\s*\1\s*!==\s*(?:null|undefined)\s*\?\s*\1\s*:/i.test(line)) {
      add("redundant-null-fallback", ln, line);
    }

    // 11. tautological-test
    if (
      !isComment &&
      /(?:expect\s*\(\s*(?:true|1)\s*\)\s*\.to(?:Be|Equal)\s*\(\s*(?:true|1)\s*\)|assert\.(?:strictEqual|equal)\s*\(\s*(?:true|1)\s*,\s*(?:true|1)\s*\)|assert\s+True\b)/.test(line)
    ) {
      add("tautological-test", ln, line);
    }

    // 12. empty-or-swallowed-catch (exempts blocks with substantive explanatory comments)
    if (!isComment) {
      const oneLineCatch = line.match(/\bcatch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/);
      if (oneLineCatch) {
        const inner = oneLineCatch[1].trim();
        if (!inner) {
          add("empty-or-swallowed-catch", ln, line);
        } else if (/^(?:\/\/|\/\*)/.test(inner) && !isSubstantiveComment(inner)) {
          add("empty-or-swallowed-catch", ln, line);
        }
      } else if (/\bcatch\s*(?:\([^)]*\))?\s*\{\s*$/.test(trimmed)) {
        const next1 = (lines[i + 1] || "").trim();
        const next2 = (lines[i + 2] || "").trim();
        if (next1 === "}") {
          add("empty-or-swallowed-catch", ln, `${trimmed} }`);
        } else if (/^(?:\/\/|\/\*)/.test(next1) && next2 === "}" && !isSubstantiveComment(next1)) {
          add("empty-or-swallowed-catch", ln, `${trimmed} ${next1}`);
        }
      } else if (isPy && /^\s*except\b[^:]*:\s*pass\s*$/.test(line)) {
        add("empty-or-swallowed-catch", ln, line);
      }
    }

    // 13. python-bare-except
    if (isPy && /^\s*except\s*:\s*(?:#.*)?$/.test(line)) {
      add("python-bare-except", ln, line);
    }

    // 14. go-swallowed-error
    if (isGo && !isComment) {
      if (/if\s+err\s*!=\s*nil\s*\{\s*(?:return\s+nil\s*;?\s*)?\}/.test(line)) {
        add("go-swallowed-error", ln, line);
      } else if (/if\s+err\s*!=\s*nil\s*\{\s*$/.test(trimmed)) {
        const n1 = (lines[i + 1] || "").trim();
        const n2 = (lines[i + 2] || "").trim();
        if (n1 === "}" || (n1 === "return nil" && n2 === "}")) {
          add("go-swallowed-error", ln, `${trimmed} ${n1}`);
        }
      }
    }

    // 15. redundant-else-after-return
    if (!isComment && /^\s*\}\s*else\s*\{\s*$/.test(line)) {
      const prev = (lines[i - 1] || "").trim();
      if (/^(?:return\b|throw\b)/.test(prev)) {
        add("redundant-else-after-return", ln, `${prev} ${trimmed}`);
      }
    }

    // 16. trivial-passthrough-wrapper
    const wrapMatch = line.match(/^\s*(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*:\s*[^\s{]+)?\s*\{\s*return\s+([A-Za-z0-9_.]+)\s*\(([^)]*)\)\s*;?\s*\}\s*$/);
    if (wrapMatch && wrapMatch[1] !== wrapMatch[3]) {
      const paramsA = wrapMatch[2].split(",").map((s) => s.split(":")[0].trim()).filter(Boolean).join(",");
      const argsB = wrapMatch[4].split(",").map((s) => s.trim()).filter(Boolean).join(",");
      if (paramsA === argsB && paramsA.length > 0) {
        add("trivial-passthrough-wrapper", ln, line);
      }
    }

    // 17. async-without-await (for short top-level/exported async functions)
    if (isJsTs && !isComment && /^\s*(?:export\s+)?async\s+function\s+[A-Za-z0-9_]+\s*\(/.test(line)) {
      let depth = 0;
      let started = false;
      let hasAwait = false;
      let spanLines = 0;
      for (let j = i; j < Math.min(lines.length, i + 25); j++) {
        const l = lines[j];
        spanLines++;
        if (/\bawait\b/.test(l)) hasAwait = true;
        for (const ch of l) {
          if (ch === "{") {
            depth++;
            started = true;
          } else if (ch === "}") {
            depth--;
          }
        }
        if (started && depth <= 0) break;
      }
      if (started && depth <= 0 && spanLines <= 25 && !hasAwait) {
        add("async-without-await", ln, line);
      }
    }
  }

  // 18. high-comment-ratio
  if (nonEmptyLines >= 16 && commentLines / nonEmptyLines > 0.45) {
    const pct = Math.round((commentLines / nonEmptyLines) * 100);
    add("high-comment-ratio", 1, `${commentLines}/${nonEmptyLines} lines are comments`, `Over-commented file (${pct}% comment lines across ${nonEmptyLines} non-empty lines)`);
  }

  return findings;
}

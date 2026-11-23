const COMMENT_PREFIX_RX = /^\s*(?:\/\/|#)\s*(.+)$/;

function isTestFile(relPath) {
  return /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[a-z]+$|_test\.(?:go|py|rs)$|^test_/.test(
    String(relPath || "").replace(/\\/g, "/")
  );
}

export const SLOP_RULES = [
  { id: "comment-restates-code", weight: 7, message: "Comment literally restates the next line of code" },
  { id: "empty-or-swallowed-catch", weight: 14, message: "Empty or silently swallowed catch/except block" },
  { id: "redundant-else-after-return", weight: 6, message: "Redundant else block immediately after return/throw" },
  { id: "any-escape-hatch", weight: 9, message: "TypeScript 'any' escape hatch weakens type safety" },
  { id: "console-debug-leftover", weight: 6, message: "Leftover debug print/console statement" },
  { id: "banner-divider-noise", weight: 5, message: "ASCII banner comment divider noise" },
  { id: "apologetic-todo-slop", weight: 15, message: "Placeholder/apologetic AI TODO comment" },
  { id: "tautological-test", weight: 18, message: "Tautological assertion that always passes" },
  { id: "boolean-ternary-noise", weight: 7, message: "Redundant ternary returning boolean literal (? true : false)" },
  { id: "narrating-docstring", weight: 6, message: "Docstring repeats parameter or function name with no extra contract" },
  { id: "ai-prose-in-code", weight: 8, message: "AI prose phrasing inside code comment" },
  { id: "high-comment-ratio", weight: 10, message: "Over-commented file (>45% comment lines)" },
  { id: "redundant-null-fallback", weight: 7, message: "Verbose nullish check instead of ?? operator" },
  { id: "trivial-passthrough-wrapper", weight: 8, message: "Trivial one-line passthrough wrapper function" }
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
  const checkLine = (ln) => !allowedLines || allowedLines.has(ln);
  const add = (ruleId, line, snippet, detail) => {
    if (!checkLine(line)) return;
    const rule = SLOP_RULES.find((r) => r.id === ruleId);
    findings.push({
      ruleId,
      weight: rule ? rule.weight : 5,
      file: relPath,
      line,
      message: detail || (rule ? rule.message : ruleId),
      snippet: String(snippet || "").trim().slice(0, 120)
    });
  };

  let commentLines = 0;
  let nonEmptyLines = 0;

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

    // 4. comment-restates-code
    const cm = line.match(COMMENT_PREFIX_RX);
    if (cm && !/[-=*_~]{8,}/.test(cm[1])) {
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

    // 5. narrating-docstring (@param x The x. / @returns The result.)
    if (/\*\s*@param\s+\{?[^}\s]*\}?\s+([A-Za-z0-9_]+)\s+(?:the\s+)?\1\.?\s*$/i.test(trimmed)) {
      add("narrating-docstring", ln, line);
    }

    // 6. any-escape-hatch
    if (/\.(?:ts|tsx)$/.test(relPath) && /(:\s*any\b|\bas\s+any\b|<any>)/.test(line) && !isComment) {
      add("any-escape-hatch", ln, line);
    }

    // 7. console-debug-leftover (skip CLI/bin/test)
    if (!isTestFile(relPath) && !isComment && /\b(?:console\.(?:log|debug)\(|dbg!\(|print\s*\(\s*f?['"]DEBUG)/i.test(line)) {
      add("console-debug-leftover", ln, line);
    }

    // 8. boolean-ternary-noise
    if (!isComment && /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/.test(line)) {
      add("boolean-ternary-noise", ln, line);
    }

    // 9. redundant-null-fallback
    if (!isComment && /\b([A-Za-z0-9_.]+)\s*!==\s*(?:null|undefined)\s*&&\s*\1\s*!==\s*(?:null|undefined)\s*\?\s*\1\s*:/i.test(line)) {
      add("redundant-null-fallback", ln, line);
    }

    // 10. tautological-test
    if (
      !isComment &&
      /(?:expect\s*\(\s*(?:true|1)\s*\)\s*\.to(?:Be|Equal)\s*\(\s*(?:true|1)\s*\)|assert\.(?:strictEqual|equal)\s*\(\s*(?:true|1)\s*,\s*(?:true|1)\s*\)|assert\s+True\b)/.test(line)
    ) {
      add("tautological-test", ln, line);
    }

    // 11. empty-or-swallowed-catch (single line or multi-line check)
    if (!isComment && /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*)?\s*\}/.test(line)) {
      add("empty-or-swallowed-catch", ln, line);
    } else if (!isComment && /\bcatch\s*(?:\([^)]*\))?\s*\{\s*$/.test(trimmed)) {
      const next1 = (lines[i + 1] || "").trim();
      const next2 = (lines[i + 2] || "").trim();
      if (next1 === "}" || (/^(?:\/\/|\/\*)/.test(next1) && next2 === "}")) {
        add("empty-or-swallowed-catch", ln, `${trimmed} ${next1}`);
      }
    } else if (!isComment && /^\s*except\b[^:]*:\s*pass\s*$/.test(line)) {
      add("empty-or-swallowed-catch", ln, line);
    }

    // 12. redundant-else-after-return
    if (!isComment && /^\s*\}\s*else\s*\{\s*$/.test(line)) {
      const prev = (lines[i - 1] || "").trim();
      if (/^(?:return\b|throw\b)/.test(prev)) {
        add("redundant-else-after-return", ln, `${prev} ${trimmed}`);
      }
    }

    // 13. trivial-passthrough-wrapper
    const wrapMatch = line.match(/^\s*(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*:\s*[^\s{]+)?\s*\{\s*return\s+([A-Za-z0-9_.]+)\s*\(([^)]*)\)\s*;?\s*\}\s*$/);
    if (wrapMatch && wrapMatch[1] !== wrapMatch[3]) {
      const paramsA = wrapMatch[2].split(",").map((s) => s.split(":")[0].trim()).filter(Boolean).join(",");
      const argsB = wrapMatch[4].split(",").map((s) => s.trim()).filter(Boolean).join(",");
      if (paramsA === argsB && paramsA.length > 0) {
        add("trivial-passthrough-wrapper", ln, line);
      }
    }
  }

  // 14. high-comment-ratio
  if (nonEmptyLines >= 16 && commentLines / nonEmptyLines > 0.45) {
    const pct = Math.round((commentLines / nonEmptyLines) * 100);
    add("high-comment-ratio", 1, `${commentLines}/${nonEmptyLines} lines are comments`, `Over-commented file (${pct}% comment lines across ${nonEmptyLines} non-empty lines)`);
  }

  return findings;
}

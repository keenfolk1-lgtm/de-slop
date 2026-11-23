#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { SLOP_RULES } from "../src/rules.mjs";
import {
  analyzeSlop,
  runFixtureBenchmark,
  formatTextReport,
  formatMarkdownReport
} from "../src/analyzer.mjs";
import { generateSlopBadge } from "../src/badge.mjs";

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] || "help";
  const flags = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd, flags, positional };
}

function main() {
  const { cmd, flags, positional } = parseArgs(process.argv);

  if (cmd === "doctor") {
    const nodeVer = process.versions.node;
    const [maj, min] = nodeVer.split(".").map(Number);
    if (maj < 22 || (maj === 22 && min < 5)) {
      console.error(`Node.js >= 22.5.0 required, found ${nodeVer}`);
      process.exit(1);
    }
    console.log("de-slop doctor: OK");
    console.log(`  node: v${nodeVer}`);
    console.log(`  rules: ${SLOP_RULES.length}`);
    return;
  }

  if (cmd === "benchmark") {
    const { sloppy, clean } = runFixtureBenchmark();
    if (flags.json) {
      console.log(JSON.stringify({ sloppy, clean }, null, 2));
      return;
    }
    if (flags.markdown) {
      console.log("| Fixture | Slop Score | Grade | Findings |");
      console.log("| --- | ---: | :---: | ---: |");
      console.log(`| \`fixtures/sloppy-pr.ts\` | ${sloppy.slopScore}/100 | ${sloppy.grade} | ${sloppy.totalFindings} |`);
      console.log(`| \`fixtures/clean-pr.ts\` | ${clean.slopScore}/100 | ${clean.grade} | ${clean.totalFindings} |`);
      return;
    }
    console.log(`sloppy-pr.ts: ${sloppy.slopScore}/100 (${sloppy.grade}), ${sloppy.totalFindings} findings`);
    console.log(`clean-pr.ts:  ${clean.slopScore}/100 (${clean.grade}), ${clean.totalFindings} findings`);
    return;
  }

  if (cmd === "check") {
    const targetPath = positional[0] || ".";
    const rep = analyzeSlop({
      targetPath,
      diff: Boolean(flags.diff),
      staged: Boolean(flags.staged),
      baseRef: typeof flags.base === "string" ? flags.base : undefined
    });

    if (typeof flags.badge === "string") {
      fs.writeFileSync(path.resolve(flags.badge), generateSlopBadge({ score: rep.slopScore, grade: rep.grade }), "utf8");
    }

    const fmt = String(flags.format || "text").toLowerCase();
    if (fmt === "json") console.log(JSON.stringify(rep, null, 2));
    else if (fmt === "markdown") console.log(formatMarkdownReport(rep));
    else console.log(formatTextReport(rep));

    if (flags["max-score"] !== undefined && rep.slopScore > Number(flags["max-score"])) {
      process.exit(1);
    }
    return;
  }

  console.log(`de-slop v1.0.0

Commands:
  de-slop check [path] [--diff|--staged|--base ref] [--max-score N] [--badge out.svg] [--format text|json|markdown]
  de-slop benchmark [--markdown|--json]
  de-slop doctor
`);
}

try {
  main();
} catch (err) {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectFileSlop } from "./rules.mjs";
import { getGitDiffMap } from "./diff.mjs";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "target", "coverage", "__pycache__", ".venv"]);
const CODE_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs"]);

function normalizePath(p) {
  return String(p || "").replace(/\\/g, "/");
}

function loadExcludes(rootDir, extraExcludes = []) {
  const patterns = [...extraExcludes];
  const ignoreFile = path.join(rootDir, ".deslopignore");
  if (fs.existsSync(ignoreFile)) {
    for (const raw of fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (line && !line.startsWith("#")) patterns.push(line);
    }
  }
  return patterns.map((p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()).filter(Boolean);
}

function isExcluded(relPath, excludeList) {
  if (excludeList.length === 0) return false;
  const norm = normalizePath(relPath).toLowerCase();
  return excludeList.some((pat) => norm === pat || norm.includes(pat));
}

function collectFiles(targetPath, excludeList) {
  const abs = path.resolve(targetPath);
  if (!fs.existsSync(abs)) throw new Error(`Target not found: ${targetPath}`);
  const st = fs.statSync(abs);
  if (st.isFile()) {
    return { rootDir: path.dirname(abs), files: [path.basename(abs)] };
  }

  const files = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = normalizePath(path.relative(abs, full));
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        if (isExcluded(rel, excludeList)) continue;
        walk(full);
      } else if (ent.isFile() && CODE_EXTS.has(path.extname(ent.name).toLowerCase())) {
        if (!isExcluded(rel, excludeList)) files.push(rel);
      }
    }
  }
  walk(abs);
  files.sort();
  return { rootDir: abs, files };
}

export function gradeForScore(score) {
  if (score <= 10) return "A";
  if (score <= 25) return "B";
  if (score <= 45) return "C";
  if (score <= 70) return "D";
  return "F";
}

export function analyzeSlop({ targetPath = ".", diff = false, staged = false, baseRef, exclude = [] } = {}) {
  const absRoot = path.resolve(targetPath);
  const excludeBase = fs.existsSync(absRoot) && fs.statSync(absRoot).isDirectory() ? absRoot : path.dirname(absRoot);
  const excludeList = loadExcludes(excludeBase, exclude);

  let findings = [];
  let filesChecked = 0;
  let inspectedLines = 0;

  if (diff || staged || baseRef) {
    const diffMap = getGitDiffMap(absRoot, { staged, baseRef });
    for (const [rel, addedLines] of diffMap.entries()) {
      if (!CODE_EXTS.has(path.extname(rel).toLowerCase())) continue;
      if (isExcluded(rel, excludeList)) continue;
      const full = path.join(absRoot, rel);
      if (!fs.existsSync(full)) continue;
      filesChecked++;
      inspectedLines += addedLines.size;
      const content = fs.readFileSync(full, "utf8");
      findings.push(...detectFileSlop(rel, content, addedLines));
    }
  } else {
    const { rootDir, files } = collectFiles(targetPath, excludeList);
    for (const rel of files) {
      const full = path.join(rootDir, rel);
      const content = fs.readFileSync(full, "utf8");
      filesChecked++;
      inspectedLines += content.split(/\r?\n/).length;
      findings.push(...detectFileSlop(rel, content, null));
    }
  }

  const rawWeight = findings.reduce((s, f) => s + f.weight, 0);
  const scaleDenominator = Math.max(1, filesChecked);
  const slopScore = Math.min(100, Math.round(rawWeight / Math.sqrt(scaleDenominator)));
  const grade = gradeForScore(slopScore);

  const byRule = {};
  for (const f of findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
  }

  return {
    target: normalizePath(absRoot),
    mode: diff || staged || baseRef ? "diff" : "files",
    filesChecked,
    inspectedLines,
    slopScore,
    grade,
    totalFindings: findings.length,
    byRule,
    findings
  };
}

export function runFixtureBenchmark() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sloppy = analyzeSlop({ targetPath: path.join(root, "fixtures", "sloppy-pr.ts") });
  const clean = analyzeSlop({ targetPath: path.join(root, "fixtures", "clean-pr.ts") });
  return { sloppy, clean };
}

export function formatTextReport(rep) {
  const lines = [
    `de-slop (${rep.mode}): ${rep.target}`,
    `  score: ${rep.slopScore}/100 (Grade ${rep.grade}) | files: ${rep.filesChecked} | findings: ${rep.totalFindings}`
  ];
  if (rep.findings.length === 0) {
    lines.push("  status: CLEAN");
    return lines.join("\n");
  }
  lines.push("");
  for (const f of rep.findings) {
    lines.push(`[+${f.weight}] ${f.ruleId} ${f.file}:${f.line} - ${f.message}`);
    if (f.suggestion) lines.push(`  fix: ${f.suggestion}`);
    if (f.snippet) lines.push(`  ${f.snippet}`);
  }
  return lines.join("\n");
}

export function formatMarkdownReport(rep) {
  const lines = [
    `### de-slop report`,
    `Score: **${rep.slopScore}/100 (Grade ${rep.grade})** across ${rep.filesChecked} file(s), ${rep.totalFindings} finding(s).`,
    ""
  ];
  if (rep.findings.length === 0) {
    lines.push("No AI-slop patterns found.");
    return lines.join("\n");
  }
  lines.push("| Rule | Location | Weight | Issue | Fix |");
  lines.push("| --- | --- | ---: | --- | --- |");
  for (const f of rep.findings) {
    lines.push(`| \`${f.ruleId}\` | \`${f.file}:${f.line}\` | +${f.weight} | ${f.message} | ${f.suggestion || ""} |`);
  }
  return lines.join("\n");
}

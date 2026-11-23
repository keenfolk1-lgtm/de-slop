import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeSlop, runFixtureBenchmark } from "../src/analyzer.mjs";
import { generateSlopBadge } from "../src/badge.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN_PATH = path.join(REPO_ROOT, "bin", "de-slop.mjs");

test("fixture benchmark scores sloppy-pr high (F) and clean-pr low (A)", () => {
  const { sloppy, clean } = runFixtureBenchmark();
  assert.ok(sloppy.slopScore >= 70, `expected sloppyScore >= 70, got ${sloppy.slopScore}`);
  assert.equal(sloppy.grade, "F");
  assert.equal(clean.slopScore, 0);
  assert.equal(clean.grade, "A");

  assert.ok(sloppy.byRule["empty-or-swallowed-catch"] >= 1);
  assert.ok(sloppy.byRule["any-escape-hatch"] >= 1);
  assert.ok(sloppy.byRule["apologetic-todo-slop"] >= 1);
  assert.ok(sloppy.byRule["boolean-ternary-noise"] >= 1);
  assert.ok(sloppy.byRule["tautological-test"] >= 1);
});

test("git diff mode analyzes only added lines and --max-score enforces CI gate", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "de-slop-diff-"));
  try {
    const git = (args) =>
      spawnSync("git", ["-c", "safe.directory=*", ...args], { cwd: tmpDir, encoding: "utf8", windowsHide: true });

    git(["init", "-b", "main"]);
    git(["config", "user.name", "Tester"]);
    git(["config", "user.email", "tester@example.com"]);

    // Legacy file with old `any` that is NOT touched in diff
    const filePath = path.join(tmpDir, "app.ts");
    fs.writeFileSync(
      filePath,
      "export function legacy(x: any) {\n  return x;\n}\nexport function ok(n: number) {\n  return n + 1;\n}\n"
    );
    git(["add", "."]);
    git(["commit", "-m", "base"]);

    // Add clean line only
    fs.writeFileSync(
      filePath,
      "export function legacy(x: any) {\n  return x;\n}\nexport function ok(n: number) {\n  return n + 2;\n}\n"
    );
    const cleanDiff = analyzeSlop({ targetPath: tmpDir, diff: true });
    assert.equal(cleanDiff.slopScore, 0);

    // Add sloppy lines
    fs.writeFileSync(
      filePath,
      "export function legacy(x: any) {\n  return x;\n}\nexport function ok(n: number) {\n  const flag = n > 0 ? true : false;\n  return flag;\n}\n"
    );
    const dirtyDiff = analyzeSlop({ targetPath: tmpDir, diff: true });
    assert.ok(dirtyDiff.totalFindings >= 1);
    assert.equal(dirtyDiff.byRule["boolean-ternary-noise"], 1);
    // Unchanged line 1 (`x: any`) was NOT flagged in diff mode
    assert.equal(dirtyDiff.byRule["any-escape-hatch"], undefined);

    const gate = spawnSync(process.execPath, [BIN_PATH, "check", path.join(REPO_ROOT, "fixtures", "sloppy-pr.ts"), "--max-score", "20"], {
      encoding: "utf8"
    });
    assert.equal(gate.status, 1);

    const svg = generateSlopBadge({ score: 0, grade: "A" });
    assert.match(svg, /^<svg /);
    assert.match(svg, /A \(0\/100\)/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

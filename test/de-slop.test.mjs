import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeSlop, runFixtureBenchmark } from "../src/analyzer.mjs";
import { detectFileSlop } from "../src/rules.mjs";
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

    const filePath = path.join(tmpDir, "app.ts");
    fs.writeFileSync(
      filePath,
      "export function legacy(x: any) {\n  return x;\n}\nexport function ok(n: number) {\n  return n + 1;\n}\n"
    );
    git(["add", "."]);
    git(["commit", "-m", "base"]);

    fs.writeFileSync(
      filePath,
      "export function legacy(x: any) {\n  return x;\n}\nexport function ok(n: number) {\n  return n + 2;\n}\n"
    );
    const cleanDiff = analyzeSlop({ targetPath: tmpDir, diff: true });
    assert.equal(cleanDiff.slopScore, 0);

    fs.writeFileSync(
      filePath,
      "export function legacy(x: any) {\n  return x;\n}\nexport function ok(n: number) {\n  const flag = n > 0 ? true : false;\n  return flag;\n}\n"
    );
    const dirtyDiff = analyzeSlop({ targetPath: tmpDir, diff: true });
    assert.ok(dirtyDiff.totalFindings >= 1);
    assert.equal(dirtyDiff.byRule["boolean-ternary-noise"], 1);
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

test("v1.1.0 catch exemptions, inline suppression, new Go/Python/TS/async rules, and --exclude work", () => {
  const cleanCatchCode = [
    "try {",
    "  JSON.parse(line);",
    "} catch {",
    "  // Ignore stray non-JSON stdout lines from external child servers",
    "}"
  ].join("\n");
  assert.equal(detectFileSlop("src/pool.mjs", cleanCatchCode).length, 0);

  const bareCatchCode = "try {\n  run();\n} catch {\n}\ntry {\n  run();\n} catch (e) {\n  // ignore\n}\n";
  const catchHits = detectFileSlop("src/pool.mjs", bareCatchCode).filter((f) => f.ruleId === "empty-or-swallowed-catch");
  assert.equal(catchHits.length, 2);

  const suppressed = "// de-slop-ignore\nconst x: any = 1;\n";
  assert.equal(detectFileSlop("src/ok.ts", suppressed).length, 0);

  const tsHits = detectFileSlop(
    "src/mod.ts",
    "// @ts-ignore\nexport async function ping() {\n  return 1;\n}\n"
  );
  assert.ok(tsHits.some((f) => f.ruleId === "ts-ignore-without-reason"));
  assert.ok(tsHits.some((f) => f.ruleId === "async-without-await"));

  const pyHits = detectFileSlop("app.py", "try:\n  work()\nexcept:\n  log()\n");
  assert.ok(pyHits.some((f) => f.ruleId === "python-bare-except"));

  const goHits = detectFileSlop("main.go", "func f() error {\n  if err != nil {\n    return nil\n  }\n  return nil\n}\n");
  assert.ok(goHits.some((f) => f.ruleId === "go-swallowed-error"));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "de-slop-excl-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "generated"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "generated", "gen.ts"), "export const x: any = 1;\n");
    fs.writeFileSync(path.join(tmpDir, "clean.ts"), "export const y: number = 1;\n");

    const rep = analyzeSlop({ targetPath: tmpDir, exclude: ["generated/"] });
    assert.equal(rep.filesChecked, 1);
    assert.equal(rep.slopScore, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

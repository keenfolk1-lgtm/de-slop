import { spawnSync } from "node:child_process";

export function parseGitDiffAddedLines(diffText) {
  const fileMap = new Map();
  let currentFile = null;
  let newLine = 0;

  for (const line of String(diffText || "").split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).replace(/\\/g, "/");
      if (!fileMap.has(currentFile)) fileMap.set(currentFile, new Set());
      continue;
    }
    if (line.startsWith("+++ /dev/null")) {
      currentFile = null;
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      fileMap.get(currentFile).add(newLine);
      newLine++;
    } else if (!line.startsWith("-") && !line.startsWith("\\")) {
      newLine++;
    }
  }
  return fileMap;
}

export function getGitDiffMap(repoRoot, { staged = false, baseRef } = {}) {
  const args = ["-c", "safe.directory=*", "diff", "--unified=0", "--no-color"];
  if (staged) args.push("--staged");
  if (baseRef) args.push(baseRef);
  const res = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  if (res.status !== 0) {
    throw new Error(`git diff failed: ${(res.stderr || "").trim()}`);
  }
  return parseGitDiffAddedLines(res.stdout);
}

export { SLOP_RULES, detectFileSlop } from "./rules.mjs";
export { parseGitDiffAddedLines, getGitDiffMap } from "./diff.mjs";
export { analyzeSlop, runFixtureBenchmark, gradeForScore, formatTextReport, formatMarkdownReport } from "./analyzer.mjs";
export { generateSlopBadge } from "./badge.mjs";

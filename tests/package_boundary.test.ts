import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? files(path) : entry.isFile() && path.endsWith(".ts") ? [path] : [];
});
test("package source has no KORE or filesystem package dependencies", () => {
  const forbidden = /(?:kore|slipstrike|engine-repo|src\/(?:entity|effects|item|rules|settings|server|scenes|game))/i;
  const violations = files("src").flatMap(file => readFileSync(file, "utf8").split("\n").filter(line => /(?:from|import)\s*["']/.test(line) && forbidden.test(line)).map(line => `${file}: ${line}`));
  expect(violations).toEqual([]);
});

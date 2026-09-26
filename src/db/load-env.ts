/**
 * Minimal .env loader for scripts run with tsx (Next.js loads .env itself).
 * Reads .env.local then .env from the project root, without overwriting
 * variables already present in the environment.
 */
import fs from "node:fs";
import path from "node:path";

function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(cwd = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(cwd, file);
    if (!fs.existsSync(p)) continue;
    const parsed = parse(fs.readFileSync(p, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

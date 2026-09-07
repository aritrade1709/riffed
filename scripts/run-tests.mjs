// Transpiles the TypeScript tests with esbuild and runs them in Node.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "riffed-test-"));
let failed = false;

for (const name of ["titles", "solver"]) {
  const file = join(out, `${name}.mjs`);
  await build({
    entryPoints: [`test/${name}.test.ts`],
    bundle: true, platform: "node", format: "esm", outfile: file, logLevel: "error",
  });
  console.log(`\n— ${name} —`);
  const r = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (r.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);

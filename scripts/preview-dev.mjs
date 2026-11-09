import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const next = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(next), "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ATHENYX_PREVIEW: "1", NEXT_PUBLIC_ATHENYX_PREVIEW: "1" },
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });

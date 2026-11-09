import { unlinkSync } from "node:fs";
import { join } from "node:path";

try {
  unlinkSync(join(process.cwd(), "tmp", "athenyx-preview-state.json"));
  console.log("Preview sample data reset. Refresh the browser.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log("Preview sample data is already reset.");
}

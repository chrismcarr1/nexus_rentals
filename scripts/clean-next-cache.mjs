import { existsSync, lstatSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const nextDir = path.resolve(projectRoot, ".next");
const relativeNextDir = path.relative(projectRoot, nextDir);
const forceClean = process.argv.includes("--force");
const isOneDriveProject =
  process.platform === "win32" &&
  projectRoot.toLowerCase().includes(`${path.sep}onedrive`);

if (relativeNextDir.startsWith("..") || path.isAbsolute(relativeNextDir)) {
  throw new Error(`Refusing to remove cache outside the project: ${nextDir}`);
}

if (!forceClean && !isOneDriveProject) {
  process.exit(0);
}

if (existsSync(nextDir)) {
  const stats = lstatSync(nextDir);

  rmSync(nextDir, {
    force: true,
    recursive: !stats.isSymbolicLink()
  });

  console.log("Removed stale .next cache.");
}

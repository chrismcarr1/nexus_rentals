import { readFile, writeFile } from "fs/promises";
import path from "path";

const target = path.join(process.cwd(), "node_modules", "next", "dist", "build", "swc", "index.js");

async function main() {
  let source = await readFile(target, "utf8");

  const before = "const importedRawBindings = await import((0, _url.pathToFileURL)(pkgPath).toString());";
  const after =
    "const resolvedPkgPath = importPath ? pkgPath : require.resolve(`${pkg}/wasm.js`); const importedRawBindings = await import((0, _url.pathToFileURL)(resolvedPkgPath).toString());";

  if (!source.includes(before)) {
    console.log("Next SWC patch not needed or already applied.");
    return;
  }

  source = source.replace(before, after);
  await writeFile(target, source, "utf8");
  console.log("Patched Next SWC WASM resolver.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

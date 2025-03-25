import esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["src/cli.ts", "src/typeparsers.ts"],
    bundle: true,
    sourcemap: true,
    platform: "node",
    outdir: "out",
    banner: {
      js: `#!/usr/bin/env node
import { createRequire as topLevelCreateRequire } from 'module';
import { fileURLToPath as topLevelFileURLToPath } from 'url';
import { dirname as topLevelDirname, join as topLevelJoin } from 'path';
const __bundleRequire = topLevelCreateRequire(import.meta.url);
const __bundleFilename = topLevelFileURLToPath(import.meta.url);
const __bundleDirname = topLevelDirname(__bundleFilename);
const __bundleJoin = topLevelJoin;

// Make these variables available globally for compatibility
globalThis.require = __bundleRequire;
globalThis.__filename = __bundleFilename;
globalThis.__dirname = __bundleDirname;
globalThis.join = __bundleJoin;
`,
    },
    external: ["pg-native"],
  })
  .catch(() => process.exit(1));

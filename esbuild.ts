import esbuild from "esbuild";
import * as fs from "node:fs/promises";

esbuild
  .build({
    entryPoints: ["src/cli.ts"],
    bundle: true,
    sourcemap: true,
    platform: "node",
    outdir: "out",
    banner: {
      js: `#!/usr/bin/env node`,
    },
    external: ["pg-native"],
  })
  .then(() => fs.copyFile("src/typeparsers.ts", "out/typeparsers.ts"))
  .catch(() => process.exit(1));

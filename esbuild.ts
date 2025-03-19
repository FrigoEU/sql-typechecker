import esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["src/cli.ts", "src/typeparsers.ts"],
    bundle: true,
    sourcemap: true,
    platform: "node",
    outdir: "out",
    banner: { js: "#!/usr/bin/env node" },
    external: ["pg-native"],
  })
  .catch(() => process.exit(1));

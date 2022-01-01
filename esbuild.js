const esbuild = require("esbuild");

const buildOptions = {
  entryPoints: ["src/cli.ts"],
  bundle: true,
  sourcemap: true,
  platform: "node",
  outdir: 'out'
};

esbuild.build(buildOptions)
  .catch(() => process.exit(1));

const esbuild = require("esbuild");

const buildServerOptions = {
  entryPoints: ["src/index.ts"],
  // define: {"process.env.NODE_ENV": "'development'"},
  bundle: true,
  jsxFactory: 'h',
  sourcemap: true,
  // external: ["pg-native"],
  loader: {
    '.png': 'file',
    '.jpg': 'file'
  },
  platform: "node",
  outdir: 'out'
};

esbuild.build(buildServerOptions).catch(() => process.exit(1));

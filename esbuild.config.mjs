import esbuild from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';
import { compileModule } from 'svelte/compiler';
import builtins from 'builtin-modules';
import { existsSync, renameSync, promises as fsp } from 'fs';

const isProd = process.argv[2] === 'production';

// All build artifacts go here so the repo root stays clean. The folder is self-contained
// (manifest.json + versions.json are copied in) so it can be copied/symlinked straight into
// <vault>/.obsidian/plugins/obsidian-kanban-flow/.
const OUT_DIR = 'dist';

// Finalize the output folder: rename the bundled CSS main.css -> styles.css (Obsidian
// convention; same shape as upstream obsidian-kanban/esbuild.config.mjs:102-115) and copy the
// static plugin files in so dist/ is directly deployable.
const finalizeOutputPlugin = {
  name: 'finalize-output',
  setup(build) {
    build.onEnd(async () => {
      const { outfile } = build.initialOptions;
      const outcss = outfile.replace(/\.js$/, '.css');
      const fixcss = outfile.replace(/main\.js$/, 'styles.css');
      if (existsSync(outcss)) renameSync(outcss, fixcss);
      await Promise.all([
        fsp.copyFile('manifest.json', `${OUT_DIR}/manifest.json`),
        fsp.copyFile('versions.json', `${OUT_DIR}/versions.json`),
      ]);
    });
  },
};

// esbuild-svelte 0.8.x only handles `.svelte` files (svelte.compile). Svelte 5 runes modules
// (`*.svelte.ts` / `*.svelte.js`) need svelte.compileModule. This plugin fills that gap:
// strip TS types with esbuild (keep class fields intact for the rune transform), then
// run compileModule so `$state` etc. become reactive. (Realizes the plan's primary store design.)
const svelteModulePlugin = {
  name: 'svelte-module',
  setup(build) {
    build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, async (args) => {
      let source = await fsp.readFile(args.path, 'utf8');
      if (args.path.endsWith('.ts')) {
        const transpiled = await esbuild.transform(source, {
          loader: 'ts',
          target: 'esnext', // keep class fields so compileModule sees the runes
          sourcefile: args.path,
        });
        source = transpiled.code;
      }
      const compiled = compileModule(source, {
        filename: args.path,
        dev: !isProd,
        generate: 'client',
      });
      return { contents: compiled.js.code, loader: 'js' };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: isProd ? false : 'inline',
  treeShaking: true,
  outfile: `${OUT_DIR}/main.js`,
  minify: isProd,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', 'node:*', ...builtins],
  plugins: [
    svelteModulePlugin,
    esbuildSvelte({
      compilerOptions: { css: 'external', runes: true, dev: !isProd },
      preprocess: sveltePreprocess(),
    }),
    finalizeOutputPlugin,
  ],
});

if (isProd) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}

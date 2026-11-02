import { build } from 'esbuild';
await Promise.all(
  ['background', 'content'].map((name) =>
    build({
      entryPoints: [`src/extension/${name}.ts`],
      outfile: `dist/${name}.js`,
      bundle: true,
      format: name === 'background' ? 'esm' : 'iife',
      target: 'chrome120',
      minify: true,
      legalComments: 'none',
    }),
  ),
);
console.log('Extension ready: load the dist directory in chrome://extensions');

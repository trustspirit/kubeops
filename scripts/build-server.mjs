import * as esbuild from 'esbuild';

// Bundle server.ts + ws handlers into a single CJS file for production.
// External deps (next, ws, @kubernetes/client-node) are resolved from node_modules at runtime.
await esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server.cjs',
  format: 'cjs',
  sourcemap: true,
  external: [
    'next',
    '@kubernetes/client-node',
    'ws',
    'node-pty',
  ],
});

console.log('Server compiled to dist/server.cjs');

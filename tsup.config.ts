import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // browser: the element and the React wrapper share one chunk, so the element registers once
    entry: { index: 'src/index.ts', react: 'src/react.tsx' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2020',
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    external: ['react'],
  },
  {
    // node: encoder, storage adapters and the CLI
    entry: { encode: 'src/node/encode.ts', storage: 'src/node/storage.ts', cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    dts: { entry: { encode: 'src/node/encode.ts', storage: 'src/node/storage.ts' } },
    splitting: true,
    sourcemap: true,
    clean: false,
    external: ['@vercel/blob', '@aws-sdk/client-s3'],
  },
])

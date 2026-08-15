import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Standalone-repository alias: the four literature packages resolve to their
// own src so tests exercise source (mirroring the main repo's tsconfig-paths
// facade) without a prior build. Host dependencies (@deepseek-ai/dsh-*,
// cordis, schemastery) come from node_modules.
export default defineConfig({
  resolve: {
    alias: {
      '@shlv/dsh-literature-core/invariant': fileURLToPath(new URL('./literature/src/invariant.ts', import.meta.url)),
      '@shlv/dsh-literature-dblp/invariant': fileURLToPath(new URL('./literature-dblp/src/invariant.ts', import.meta.url)),
      '@shlv/dsh-literature-arxiv/invariant': fileURLToPath(new URL('./literature-arxiv/src/invariant.ts', import.meta.url)),
      '@shlv/dsh-literature-tool/invariant': fileURLToPath(new URL('./tool-literature/src/invariant.ts', import.meta.url)),
      '@shlv/dsh-literature-dblp': fileURLToPath(new URL('./literature-dblp/src/index.ts', import.meta.url)),
      '@shlv/dsh-literature-arxiv': fileURLToPath(new URL('./literature-arxiv/src/index.ts', import.meta.url)),
      '@shlv/dsh-literature-tool': fileURLToPath(new URL('./tool-literature/src/index.ts', import.meta.url)),
      '@shlv/dsh-literature-core': fileURLToPath(new URL('./literature/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['{literature,literature-dblp,literature-arxiv,tool-literature}/tests/**/*.spec.ts'],
  },
})

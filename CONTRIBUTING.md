# Contributing to dsh-literature

Focused fixes, tests, provider improvements, and documentation changes are welcome. This file covers the standalone repository's development setup, dependency strategy, and release procedure; the [README](README.md) is the user-facing manual.

## Repository layout

Five packages form one pnpm workspace; every directory name matches its `@shlv` package name:

| Directory | Package | Role |
|---|---|---|
| `literature/` | `@shlv/dsh-literature` | Install bundle: the one package users `dsh plugin add`; declares the four functional packages and ships `cordis.patch.yml` |
| `literature-core/` | `@shlv/dsh-literature-core` | Service Definition (`ctx.literature`): source registry, merge/dedupe/fallback policy, record resolution, full-text strategy, shared HTTP transport, extraction helpers |
| `literature-dblp/` | `@shlv/dsh-literature-dblp` | dblp source provider |
| `literature-arxiv/` | `@shlv/dsh-literature-arxiv` | arXiv source provider |
| `literature-tool/` | `@shlv/dsh-literature-tool` | Model-facing tools (`literature_search` / `literature_bibtex` / `literature_fulltext`) |

## Development setup

```sh
pnpm install          # installs host dev deps from npm; the five packages link as a workspace
pnpm run build        # tsc, package order: core → providers → tool (the bundle has no src)
pnpm run typecheck    # core first, then --noEmit on the dependents
pnpm run test         # vitest — 221 tests, including live-API perf probes
```

`vitest.config.ts` aliases the functional packages to their `src` so tests exercise source without a prior build; `tsc` resolves inter-package types through each package's built `lib/types`.

This repository is an independent snapshot of `deepseek-harness/packages/literature`. Keep the two trees in sync manually; the seam's decision record lives at `.agents/notes/implemented/architecture/2026-08-14-literature-capability-seam.md` in the main checkout.

## Dependency strategy

The standalone repository follows the published-plugin pattern (see `dsh-vision-toolkit`):

- **Host dependencies are peers.** `@deepseek-ai/dsh-*` (`^0.1.0-rc.6`), `@deepseek-ai/cordis` (`^4.0.1`), and `@deepseek-ai/schemastery` (`^3.18.1`) are supplied by the Harness runtime that loads the plugin; the packages never install their own copy.
- **The bundle is the install surface.** `@shlv/dsh-literature` declares the four functional packages as `dependencies`, so `dsh plugin add @shlv/dsh-literature` installs the whole family at once.
- **Inter-package references use `workspace:^`.** The functional packages link as one pnpm workspace; `pnpm publish` rewrites `workspace:` specs to the released version automatically.
- **Dev dependencies pin registry versions** so `pnpm install && pnpm run test` works standalone.

## Publishing

Five packages publish in dependency order — `@shlv/dsh-literature-core` (the seam) first, then `@shlv/dsh-literature-dblp` and `@shlv/dsh-literature-arxiv`, then `@shlv/dsh-literature-tool`, and finally the `@shlv/dsh-literature` bundle:

```sh
cd ~/dsh-literature
cd literature-core && pnpm publish && cd ..    # ① seam
cd literature-dblp && pnpm publish && cd ..    # ②
cd literature-arxiv && pnpm publish && cd ..   # ③
cd literature-tool && pnpm publish && cd ..    # ④
cd literature && pnpm publish && cd ..         # ⑤ bundle, last
```

Each `pnpm publish` runs its `prepack` build (tsc) and rewrites inter-package `workspace:^` specs to the released version. The order matters: the bundle's `dependencies` are `^0.1.x`, so the four functional packages must exist on the registry first.

**Before publishing**, run `npm pack --dry-run` in each package and confirm the tarball carries the whole `lib/` tree. The tsc build emits one js file per source module (`lib/error.js`, `lib/merge.js`, …), so `files` must be `["lib"]` — the single-file whitelist of the tsdown-based main repo ships a tarball that fails to load at runtime (that is exactly what broke `0.1.0`).

**After publishing a new version**, `dsh plugin add` may still install the previous one because pnpm caches registry metadata. Install with an explicit version (`dsh plugin add @shlv/dsh-literature@0.1.1`) or clear the metadata cache first (`pnpm cache clean`).

## Verification

- `pnpm run typecheck` and `pnpm run test` must pass (221 tests, including live-API perf probes).
- `npm pack --dry-run` on each functional package must list every `lib/*.js` module.
- The real profile acceptance: `dsh plugin --profile headless add @shlv/dsh-literature`, then `dsh --profile headless --dump-config` shows the four plugin rows, and a keyed task runs `literature_search` → `literature_bibtex` → `literature_fulltext`.

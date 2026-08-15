# dsh-literature — Literature Research for DeepSeek Harness

English | [中文](README.zh.md)

**One query across dblp and arXiv.** The literature research capability for DeepSeek Harness: search both sources, get one merged record per paper, the most authoritative BibTeX available, and full text when it exists — without the model ever juggling two databases itself.

This is the standalone repository of the four-package literature family. It installs into any DeepSeek Harness profile (Web or Headless) as a bundle patch, and ships three model-facing tools: `literature_search`, `literature_bibtex`, and `literature_fulltext`.

## Why this exists

Academic search splits across two databases with complementary coverage: **dblp** holds formal published records (plus CoRR mirrors of arXiv `cs.*` preprints), while **arXiv** holds preprints that dblp syncs with a lag. Asking the model to query both and reconcile the answers wastes tokens and produces inconsistent citations. This seam does the reconciliation once: dedupe, authoritative-source preference, and fallback are policy, not prompt engineering.

## Highlights

- **One merged record per paper.** A dblp CoRR mirror, its formal published record, and the arXiv preprint collapse into a single record — deduped by arXiv id (derived from the CoRR key when needed), then publisher DOI, then normalized title.
- **Authoritative BibTeX, automatically.** Formal dblp entry wins for published papers; a still-unpublished preprint gets the citation-correct arXiv `@misc`; the dblp CoRR mirror is the last resort. No more citing a mirror artifact as the paper of record.
- **Full text when it exists.** Acquires the arXiv LaTeX source tarball, then the HTML5 rendering, then the PDF — and for DOI-only or landing-page references, resolves the publisher PDF link through a zero-tool subagent and extracts the body text.
- **Stable ids the model can reuse.** Every merged record carries a synthetic `id` (`arxiv:…`, `dblp:…`, `doi:…`, `title:…`) the model can pass straight back to `literature_bibtex` / `literature_fulltext`.
- **Precise title resolution.** Title queries pull the full dblp hit list plus a phrase-quoted arXiv search, then rerank by BM25 title similarity — the paper you meant wins even when a newer same-topic paper would sort first.
- **Slow downloads never block a turn.** `literature_fulltext` runs as a background `ctx.jobs` job by default and returns a job id; `job_output` collects the result. Downloads that measure 25–60 s on publisher sites don't stall the agent loop.
- **Hardened transport.** One SSRF-guarded HTTP layer for every request: URL hygiene, no embedded credentials, same-origin redirects with at most one cross-origin hop, byte caps, and cooperative deadlines.
- **Polite by default.** Both providers serialize through a rate limiter (arXiv at its documented 3 s interval, with exponential backoff on 429/503); one throttled source never sinks a search.

## Architecture

The family mirrors the DeepSeek Harness capability-seam pattern — Service Definition / Provider / Consumer:

| Package | Role | Registers |
|---|---|---|
| [`literature/`](literature/README.md) | **Service Definition** (`ctx.literature`): source registry, merge/dedupe/fallback policy, record resolution, full-text strategy, shared HTTP transport, extraction helpers, `LiteratureError` taxonomy | `ctx.literature` |
| [`literature-dblp/`](literature-dblp/README.md) | **dblp source provider**: search API, record XML lookup, per-record BibTeX, CoRR↔arXiv key bridge | registers a source on `ctx.literature` |
| [`literature-arxiv/`](literature-arxiv/README.md) | **arXiv source provider**: Atom search, exact-id lookup, BibTeX, full-text artifact download | registers a source on `ctx.literature` |
| [`tool-literature/`](tool-literature/README.md) | **Consumer**: the three model-facing tools, their schemas, presentation, and the publisher-PDF-link subagent fallback | `ctx.tools` |

The two sources share one seam with a dblp-preferred policy because they evolve independently: the full-text machinery (tar, pdf.js) must not drag the dblp provider, and a deployment that loads only one provider still gets a working search.

## Quick start

Install the four published packages into any profile (Web or Headless). While developing from source, mount the family with the bundled patch instead.

```sh
dsh plugin --profile headless add @shlv/dsh-literature @shlv/dsh-literature-dblp @shlv/dsh-literature-arxiv @shlv/dsh-tool-literature
dsh plugin --profile web add @shlv/dsh-literature @shlv/dsh-literature-dblp @shlv/dsh-literature-arxiv @shlv/dsh-tool-literature
```

The three support packages register on `ctx.literature`; the tool package (`dsh-tool-literature`) declares them as peers, so install all four (or rely on the bundle patch, which inserts all four at once). From a source checkout with `DEEPSEEK_API_KEY` set:

```sh
cd deepseek-harness   # a dsh checkout
pnpm dsh --profile headless --patch /path/to/dsh-literature/literature.patch.yml \
  "search for 'Attention is all you need', fetch its BibTeX, then download the full text"
```

`literature_fulltext`'s background mode additionally needs `@deepseek-ai/dsh-jobs-local` and `@deepseek-ai/dsh-tool-jobs`; the publisher-PDF fallback needs the `subagents` service with a provider supporting `outputSchema` (default `spawn`).

## Tools

| Tool | What it does |
|---|---|
| `literature_search` | Query dblp and arXiv, merge/dedupe, return records with stable ids, source-native titles, venues, DOIs, arXiv ids, and abstracts. |
| `literature_bibtex` | Resolve a title, arXiv id, dblp key, or DOI to one BibTeX entry — formal dblp → arXiv `@misc` → dblp CoRR mirror — with a provenance note when the year is version-dependent. |
| `literature_fulltext` | Acquire full text (arXiv source → HTML → PDF → publisher PDF via a subagent) and persist the extracted files into the session workspace under `literature/<id>/`. Background by default; returns the bounded summary plus file paths. |

Each tool takes one free-form `query` string; the seam recognizes whether it is a title, an arXiv id, a dblp key, a DOI, or a URL.

## Service API (`ctx.literature`)

| Member | Semantics |
|---|---|
| `registerSource(source)` | Register a source (`dblp` or `arxiv`); rejects duplicates; returns a disposer. |
| `search(request, signal?)` | Run every selected available source in parallel and merge the normalized hits. |
| `resolveRecord(input, signal?)` | Resolve a title, arXiv id, dblp key, CoRR key, or DOI into one merged record; exact identifiers win over fuzzy title matches. |
| `bibtex(input, signal?)` | Select the most authoritative BibTeX entry (formal dblp → arXiv → CoRR mirror). |
| `fulltext(input, signal?)` | Acquire full text in priority order (arXiv source → HTML → PDF → explicit PDF URL); throws `LITERATURE_FULLTEXT_UNAVAILABLE` when no artifact exists. |
| `landingPage(input, signal?)` | Fetch a publisher landing page by DOI or URL and return bounded, minified HTML for PDF-link analysis. |

## Merge and fallback policy

- **Dedupe** keys a paper by arXiv id (derived from the dblp CoRR key `journals/corr/abs-YYMM-NNNNN` when present), then publisher DOI, then normalized title. A differing DOI is not decisive: a CoRR mirror carries the arXiv DataCite DOI (`10.48550/…`) while its formal record carries the publisher DOI.
- **Merge** prefers the formal dblp record's venue, year, DOI, and BibTeX, and retains the arXiv id from the CoRR mirror or the arXiv hit.
- **BibTeX** prefers the formal dblp record; a still-unpublished preprint gets the arXiv `@misc` (citation-correct, unlike dblp's CoRR `@article`-in-`CoRR` artifact), with the dblp CoRR mirror as the last resort.
- **Full text** prefers the arXiv LaTeX source tarball, then the arXiv HTML5, then the arXiv PDF, then an explicit PDF URL. A failed artifact kind falls through to the next one (a PDF-only submission whose `/e-print` serves a PDF still resolves through `/pdf`).

## Configuration

Each package accepts validated config through its cordis.yml row; every value is defaulted and deployment-tunable.

| Package | Key options (defaults) |
|---|---|
| `literature` | `enabledSources` (all registered), `searchMaxResults` (10), `timeoutMs` (60 000), `downloadMaxBytes` (100 MB), `extractMaxChars` (200 000), `summaryMaxChars` (4000), `landingPageMaxChars` (20 000), `maxRedirects` (5), `maxUrlLength` (2048), `userAgent` |
| `literature-dblp` | `baseUrl` (`https://dblp.org`), `timeoutMs` (30 000), `maxResponseBytes` (5 MB), `rateLimitMs` (1000), `userAgent` |
| `literature-arxiv` | `apiBase` (`https://export.arxiv.org`), `wwwBase` (`https://arxiv.org`), `timeoutMs` (30 000), `maxResponseBytes` (100 MB), `rateLimitMs` (3000), `rateLimitBackoffBaseMs` (3000), `rateLimitBackoffMaxRetries` (5) |
| `tool-literature` | `subagentProvider` (`spawn`) |

## Model experience

The tools keep model context lean: `literature_search` returns one line per paper with a truncation footer, `literature_bibtex` one fenced block plus an optional note, and `literature_fulltext` a bounded summary with the extracted bodies written to disk rather than echoed into the prompt. The seam contributes no prompt or schema itself; the consumer owns every model-visible string.

## Development

```sh
pnpm install          # installs host dev deps from npm; the four packages link as a workspace
pnpm run build        # tsc, package order: literature → providers → tool
pnpm run typecheck    # literature first, then --noEmit on the dependents
pnpm run test         # vitest — 221 tests, including live-API perf probes
```

`vitest.config.ts` aliases the four packages to their `src` so tests exercise source without a prior build; `tsc` resolves inter-package types through each package's built `lib/types`.

## Dependency strategy

This standalone repository follows the published-plugin pattern (see `dsh-vision-toolkit`):

- **Host dependencies are peers.** `@deepseek-ai/dsh-*` (`^0.1.0-rc.6`), `@deepseek-ai/cordis` (`^4.0.1`), and `@deepseek-ai/schemastery` (`^3.18.1`) are supplied by the Harness runtime that loads the plugin; the packages never install their own copy.
- **Inter-package references use `workspace:^`.** The four packages link as one pnpm workspace; `pnpm publish` rewrites `workspace:` specs to the released version automatically.
- **Dev dependencies pin registry versions** so `pnpm install && pnpm run test` works standalone.
- **Source resolution stays local.** Tests alias to `src`; the build order (seam first) feeds each dependent's `lib/types`.

## Publishing

The four packages publish in dependency order: `literature` (the seam) first, then `literature-dblp` and `literature-arxiv`, then `tool-literature` — each `pnpm publish` runs its `prepack` build and rewrites inter-package `workspace:^` specs to the released version. The standalone snapshot of `deepseek-harness/packages/literature` and the main checkout must be kept in sync manually.

## Known limitations

- **Publisher bot walls**: dl.acm.org returns 403 to non-browser clients, so ACM-DL DOIs fail at the landing-page fetch.
- **The arXiv HTML5 rendering exists only for a subset of papers**; the provider returns `null` for the other kinds so the seam falls back.
- **The CoRR bridge covers only arXiv `cs.*` categories**; non-CS papers rely on DOI or title matching.
- **LaTeX → prose is lossy**: the source-tarball summary strips commands and comments, not a rendered document.
- **SSRF / private-network blocking is deferred**, matching the web fetch provider: http(s) only, no embedded credentials, same-origin redirects with at most one cross-origin hop.

## License

MIT

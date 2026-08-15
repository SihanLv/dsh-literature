# dsh-literature — Literature Research for DeepSeek Harness

English | [中文](README.zh.md)

**Source:** [github.com/SihanLv/dsh-literature](https://github.com/SihanLv/dsh-literature)

**One query across dblp and arXiv.** The literature research capability for DeepSeek Harness: search both sources, get one merged record per paper, the most authoritative BibTeX available, and full text when it exists — without the model ever juggling two databases itself.

Install `@shlv/dsh-literature` into any profile (Web or Headless) and you get three model-facing tools: `literature_search`, `literature_bibtex`, and `literature_fulltext`.

## Quick start

```sh
dsh plugin --profile headless add @shlv/dsh-literature
dsh plugin --profile web add @shlv/dsh-literature
```

One command installs the whole family. From a source checkout with `DEEPSEEK_API_KEY` set, mount the repository patch instead:

```sh
cd deepseek-harness   # a dsh checkout
pnpm dsh --profile headless --patch /path/to/dsh-literature/literature.patch.yml \
  "search for 'Attention is all you need', fetch its BibTeX, then download the full text"
```

## Why this exists

Academic search splits across two databases with complementary coverage: **dblp** holds formal published records (plus CoRR mirrors of arXiv `cs.*` preprints), while **arXiv** holds preprints that dblp syncs with a lag. Asking the model to query both and reconcile the answers wastes tokens and produces inconsistent citations. This seam does the reconciliation once: dedupe, authoritative-source preference, and fallback are policy, not prompt engineering.

## Highlights

- **One merged record per paper.** A dblp CoRR mirror, its formal published record, and the arXiv preprint collapse into a single record — deduped by arXiv id (derived from the CoRR key when needed), then publisher DOI, then normalized title.
- **Authoritative BibTeX, automatically.** Formal dblp entry wins for published papers; a still-unpublished preprint gets the citation-correct arXiv `@misc`; the dblp CoRR mirror is the last resort. No more citing a mirror artifact as the paper of record.
- **Full text when it exists.** Acquires the arXiv LaTeX source tarball, then the HTML5 rendering, then the PDF — and for DOI-only or landing-page references, resolves the publisher PDF link through a zero-tool subagent and extracts the body text.
- **Stable ids the model can reuse.** Every merged record carries a synthetic `id` (`arxiv:…`, `dblp:…`, `doi:…`, `title:…`) the model can pass straight back to `literature_bibtex` / `literature_fulltext`.
- **Precise title resolution.** Title queries pull the full dblp hit list plus a phrase-quoted arXiv search, then rerank by BM25 title similarity — the paper you meant wins even when a newer same-topic paper would sort first.
- **Slow downloads never block a turn.** `literature_fulltext` runs as a background `ctx.jobs` job by default and returns a job id; `job_output` collects the result. Downloads that measure 25–60 s on publisher sites don't stall the agent loop.
- **Hardened transport.** One HTTP layer for every request with URL hygiene, no embedded credentials, same-origin redirects with at most one cross-origin hop, byte caps, and cooperative deadlines.
- **Polite by default.** Both providers serialize through a rate limiter (arXiv at its documented 3 s interval, with exponential backoff on 429/503); one throttled source never sinks a search.

## Architecture

The family mirrors the DeepSeek Harness capability-seam pattern — Service Definition / Provider / Consumer — behind one installable bundle:

| Package | Role | Registers |
|---|---|---|
| `@shlv/dsh-literature` (bundle) | **Install bundle**: the one package you `dsh plugin add`; depends on the four functional packages and ships the patch that mounts them | profile bundle layer |
| `@shlv/dsh-literature-core` | **Service Definition** (`ctx.literature`): source registry, merge/dedupe/fallback policy, record resolution, full-text strategy, shared HTTP transport, extraction helpers, `LiteratureError` taxonomy | `ctx.literature` |
| `@shlv/dsh-literature-dblp` | **dblp source provider**: search API, record XML lookup, per-record BibTeX, CoRR↔arXiv key bridge | registers a source on `ctx.literature` |
| `@shlv/dsh-literature-arxiv` | **arXiv source provider**: Atom search, exact-id lookup, BibTeX, full-text artifact download | registers a source on `ctx.literature` |
| `@shlv/dsh-literature-tool` | **Consumer**: the three model-facing tools, their schemas, presentation, and the publisher-PDF-link subagent fallback | `ctx.tools` |

You only ever install the bundle; the other four are its dependencies. The two sources share one seam because they evolve independently: the full-text machinery (tar, pdf.js) must not drag the dblp provider, and a deployment that loads only one provider still gets a working search.

## Requirements

- DeepSeek Harness `0.1.0-rc.6` or a compatible later release (the plugin declares `@deepseek-ai/dsh-*` peers at that release line).
- Node.js `^22.19` or `>=24`.
- `literature_fulltext`'s background mode uses `@deepseek-ai/dsh-jobs-local` and `@deepseek-ai/dsh-tool-jobs`, which the Harness profile base bundle provides by default (the headless and web profiles ship them); if your profile lacks them, add them with `dsh plugin add`.
- The publisher-PDF fallback needs the `subagents` service with a provider supporting `outputSchema` (default `spawn`). Without it, DOI-only and landing-page inputs report `LITERATURE_FULLTEXT_UNAVAILABLE`; search, BibTeX, and arXiv full text still work.

## Install and lifecycle

```sh
dsh plugin --profile headless add @shlv/dsh-literature      # install
dsh plugin --profile headless remove @shlv/dsh-literature   # uninstall
```

**Upgrading.** After a new release, `dsh plugin add` may still install the previous version because pnpm caches registry metadata. Install with an explicit version, or clear the metadata cache first:

```sh
dsh plugin --profile headless add @shlv/dsh-literature@0.1.1
# or: pnpm cache clean
```

## Tools

| Tool | What it does |
|---|---|
| `literature_search` | Query dblp and arXiv, merge/dedupe, return records with stable ids, source-native titles, venues, DOIs, arXiv ids, and abstracts. |
| `literature_bibtex` | Resolve a title, arXiv id, dblp key, or DOI to one BibTeX entry — formal dblp → arXiv `@misc` → dblp CoRR mirror — with a provenance note when the year is version-dependent. |
| `literature_fulltext` | Acquire full text: the arXiv source tarball → HTML → PDF, then — for papers without an arXiv preprint — the publisher PDF link via a subagent; an explicit PDF or landing-page URL is accepted directly. Persists the extracted files into the session workspace under `literature/<id>/`. Background by default; returns the bounded summary plus file paths. |

Each tool takes one free-form `query` string; the seam recognizes titles, arXiv ids, dblp keys, DOIs, and URLs. `literature_bibtex` resolves titles, arXiv ids, dblp keys, and DOIs (a URL input is rejected); `literature_search` and `literature_fulltext` additionally accept URLs.

## Service API (`ctx.literature`)

| Member | Semantics |
|---|---|
| `registerSource(source)` | Register a source (`dblp` or `arxiv`); rejects duplicates; returns a disposer. |
| `search(request, signal?)` | Run every selected available source in parallel and merge the normalized hits. |
| `resolveRecord(input, signal?)` | Resolve a title, arXiv id, dblp key, CoRR key, or DOI into one merged record; exact identifiers win over fuzzy title matches. |
| `bibtex(input, signal?)` | Select the most authoritative BibTeX entry (formal dblp → arXiv → CoRR mirror). |
| `fulltext(input, signal?)` | Acquire full text in priority order (arXiv source → HTML → PDF → explicit PDF URL). A record without an arXiv preprint has no seam-level artifact and reports `LITERATURE_FULLTEXT_UNAVAILABLE`; the tool then resolves the publisher PDF link via `landingPage` and a subagent. |
| `landingPage(input, signal?)` | Fetch a publisher landing page by DOI or URL and return bounded, minified HTML for PDF-link analysis. |

## Merge and fallback policy

- **Dedupe** keys a paper by arXiv id (derived from the dblp CoRR key `journals/corr/abs-YYMM-NNNNN` when present), then publisher DOI, then normalized title. A differing DOI is not decisive: a CoRR mirror carries the arXiv DataCite DOI (`10.48550/…`) while its formal record carries the publisher DOI.
- **Merge** prefers the formal dblp record's venue, year, DOI, and BibTeX, and retains the arXiv id from the CoRR mirror or the arXiv hit.
- **BibTeX** prefers the formal dblp record; a still-unpublished preprint gets the arXiv `@misc` (citation-correct, unlike dblp's CoRR `@article`-in-`CoRR` artifact), with the dblp CoRR mirror as the last resort.
- **Full text** prefers the arXiv LaTeX source tarball, then the arXiv HTML5, then the arXiv PDF, then an explicit PDF URL. A failed artifact kind falls through to the next one (a PDF-only submission whose `/e-print` serves a PDF still resolves through `/pdf`). A record without an arXiv id has no seam-level artifact; the tool resolves the publisher PDF link through a subagent.

## Configuration

Each package accepts validated config through its cordis.yml row; every value is defaulted and deployment-tunable.

| Package | Key options (defaults) |
|---|---|
| `literature-core` | `enabledSources` (all registered), `searchMaxResults` (10), `timeoutMs` (60 000), `downloadMaxBytes` (100 MB), `extractMaxChars` (200 000), `summaryMaxChars` (4000), `landingPageMaxChars` (20 000), `maxRedirects` (5), `maxUrlLength` (2048), `userAgent` |
| `literature-dblp` | `baseUrl` (`https://dblp.org`), `timeoutMs` (30 000), `maxResponseBytes` (5 MB), `rateLimitMs` (1000), `userAgent` |
| `literature-arxiv` | `apiBase` (`https://export.arxiv.org`), `wwwBase` (`https://arxiv.org`), `timeoutMs` (30 000), `maxResponseBytes` (100 MB), `rateLimitMs` (3000), `rateLimitBackoffBaseMs` (3000), `rateLimitBackoffMaxRetries` (5) |
| `literature-tool` | `subagentProvider` (`spawn`) |

## Model experience

The tools keep model context lean: `literature_search` returns one line per paper with a truncation footer, `literature_bibtex` one fenced block plus an optional note, and `literature_fulltext` a bounded summary with the extracted bodies written to disk rather than echoed into the prompt. The seam contributes no prompt or schema itself; the consumer owns every model-visible string.

## Troubleshooting

- **The plugin fails to load after install** ("Cannot find module … `lib/error.js`"): the installed package is missing its runtime modules. Reinstall at the latest version (`dsh plugin --profile headless add @shlv/dsh-literature@<version>`); versions whose tarball ships only `lib/index.js` are broken.
- **`dsh plugin add` installs an old version**: pnpm's registry metadata cache. Use an explicit version or `pnpm cache clean` (see [Install and lifecycle](#install-and-lifecycle)).
- **A DOI-only paper reports `LITERATURE_FULLTEXT_UNAVAILABLE`**: the `subagents` service or the configured provider is absent, or the publisher blocks non-browser clients (dl.acm.org returns 403). Pass the explicit PDF URL in that case.
- **arXiv full text for an old paper**: the HTML5 rendering exists only for a subset of papers; the seam falls back to the PDF, which arXiv itself serves — no publisher involved. Papers without an arXiv preprint (dblp-only records) instead resolve the publisher PDF link, which bot walls can block.

## Development and verification

```sh
pnpm install && pnpm run build && pnpm run typecheck && pnpm run test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, dependency strategy, release procedure, and the full verification checklist.

## Known limitations

- **Publisher bot walls**: dl.acm.org returns 403 to non-browser clients, so ACM-DL DOIs fail at the landing-page fetch.
- **The arXiv HTML5 rendering exists only for a subset of papers**; the provider returns `null` for the other kinds so the seam falls back.
- **The CoRR bridge covers only arXiv `cs.*` categories**; non-CS papers rely on DOI or title matching.
- **LaTeX → prose is lossy**: the source-tarball summary strips commands and comments, not a rendered document.
- **SSRF / private-network blocking is deferred**, matching the web fetch provider: http(s) only, no embedded credentials, same-origin redirects with at most one cross-origin hop.

## License

MIT

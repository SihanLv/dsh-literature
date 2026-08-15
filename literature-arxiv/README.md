# @shlv/dsh-literature-arxiv

English | [中文](README.zh.md)

The **arXiv source provider** for the literature seam: Atom search, exact-id lookup, per-record BibTeX, and full-text artifact download (the LaTeX source tarball, the HTML, and the PDF). Registers a `LiteratureSource` with id `arxiv` on `ctx.literature`.

## Endpoints

- Search/lookup: `GET <apiBase>/api/query?search_query=…` / `?id_list=…` → Atom entries (id, title, summary, updated, authors, `arxiv:doi`, `arxiv:journal_ref`).
- BibTeX: `GET <wwwBase>/bibtex/<id>` (the arXiv citation; note its `year` may reflect the latest version).
- Full text: `GET <wwwBase>/e-print/<id>` (source tarball), `/html/<id>` (HTML5, not every paper), `/pdf/<id>` (PDF).

## Model Experience

Indirectly, through `dsh-tool-literature`, which renders this source's records, BibTeX, and extracted full text into the model-facing tools.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- The HTML5 rendering exists only for a subset of papers; the provider returns `null` for the other kinds so the seam falls back.
- The arXiv BibTeX `year` can reflect the latest version rather than the original submission; the seam prefers the dblp CoRR BibTeX for that reason. The record `year` uses the Atom `published` (first-submission) date, so it does not drift with later revisions.
- Polite rate limiting (default `rateLimitMs` 3000, arXiv's documented 3s interval) serializes all requests through one source instance; a 429/503 response is retried with exponential backoff (`rateLimitBackoffBaseMs × 2^retry`, default base 3000), up to `rateLimitBackoffMaxRetries` (default 5). A search that is still throttled after the retry budget reports `LITERATURE_RATE_LIMITED` instead of silently returning empty results.

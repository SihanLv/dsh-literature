# @shlv/dsh-literature

English | [中文](README.zh.md)

The **literature research seam** (`ctx.literature`): a source registry and provider-merging service over dblp (formal published records plus CoRR preprint mirrors) and arXiv (preprints). This package owns the Service Definition role — the source registry, the merge/dedupe/fallback policy, record resolution, the full-text strategy, the shared SSRF-guarded HTTP transport, the extraction helpers, and the `LiteratureError` taxonomy.

## Service API (`ctx.literature`)

| Member | Semantics |
|---|---|
| `registerSource(source)` | Register a source (id `dblp` or `arxiv`). Rejects a duplicate id. Returns a disposer. |
| `search(request, signal?)` | Run every selected `available()` source in parallel and merge the normalized hits. |
| `resolveRecord(input, signal?)` | Resolve a title, arXiv id, dblp key, CoRR key, or DOI into one merged record; an exact identifier (arXiv id, dblp key, DOI) prefers the record carrying it, and a title query pulls the full dblp hit list plus a phrase arXiv search and ranks the merged records by BM25 title similarity. |
| `bibtex(input, signal?)` | Select a BibTeX entry: the formal dblp record, then arXiv (a preprint's canonical `@misc`), then the dblp CoRR mirror. |
| `fulltext(input, signal?)` | Acquire full text in priority order (arXiv source → HTML → PDF, then an explicit PDF URL); throws `LITERATURE_FULLTEXT_UNAVAILABLE` when no artifact exists. |
| `landingPage(input, signal?)` | Fetch a publisher landing page by DOI or URL and return its bounded, minified HTML (capped by `landingPageMaxChars`): style, comments, and whitespace stripped; inline scripts and header/footer/nav/noscript content kept so PDF links in any of them reach the subagent. |

Selection honors `enabledSources` config when set; otherwise every registered `available()` source runs. One throttled source does not sink a search: a `LITERATURE_RATE_LIMITED` (429/503) or `LITERATURE_FETCH_FAILED` search response is reported through the seam's per-source tolerance, and a search fails loudly only when every selected source fails.

## Merge and fallback policy

- **Dedupe** keys a paper by its arXiv id (derived from the dblp CoRR key `journals/corr/abs-YYMM-NNNNN` when present), then its publisher DOI, then its normalized title. A differing DOI is not decisive: a CoRR mirror carries the arXiv DataCite DOI (`10.48550/…`) while its formal record carries the publisher DOI.
- **Merge** prefers the formal dblp record's venue/year/DOI/BibTeX and retains the arXiv id from the CoRR mirror or the arXiv hit.
- **BibTeX** prefers the formal dblp record; a still-unpublished preprint gets the arXiv `@misc` (citation-correct, unlike dblp's CoRR `@article`-in-`CoRR` artifact), with the dblp CoRR mirror as a last resort.
- **Full text** prefers the arXiv LaTeX source tarball, then the arXiv HTML, then the arXiv PDF, then an explicit PDF URL. For a DOI-only record (or a landing-page URL) the consumer resolves the publisher PDF link through a subagent over `landingPage` output; the seam itself stays retrieval-only and reports `LITERATURE_FULLTEXT_UNAVAILABLE` when no artifact exists.

## Model Experience

Indirectly, through `dsh-tool-literature`, which owns the model-facing tool schemas, prose, and result rendering; this registry contributes no prompt or schema itself.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **SSRF / private-network blocking is deferred**, matching the web fetch provider: only http(s), no embedded credentials, and same-origin redirects are enforced, with at most one cross-origin hop allowed on request (the `doi.org` resolver, and explicit PDF/landing-page fetches whose publisher links redirect to a CDN) ([web capability Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)).
- **LaTeX → prose is lossy**: the source-tarball summary strips commands/comments, not a rendered document. Full LaTeX rendering is deferred.
- **The CoRR bridge covers only arXiv `cs.*` categories**; non-CS papers rely on DOI or title matching.

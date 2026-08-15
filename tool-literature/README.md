# @shlv/dsh-literature-tool

English | [中文](README.zh.md)

Model-facing literature tools over `ctx.literature`: `literature_search`, `literature_bibtex`, and `literature_fulltext`. This package owns the tool names, schemas, validation, and presentation; the literature seam owns retrieval, merging, and fallback.

## Usage

- `literature_search` — query dblp and arXiv, merge/dedupe, and return records with stable ids.
- `literature_bibtex` — resolve a title, arXiv id, dblp key, or DOI to a BibTeX entry (formal dblp → arXiv `@misc` → dblp CoRR mirror).
- `literature_fulltext` — acquire full text (arXiv source → HTML → PDF → publisher PDF via a subagent) and persist the extracted text files into the session workspace under `literature/<id>/`. The acquisition runs in the background by default as a `ctx.jobs` job (all download paths, including slow publisher PDFs) and is collected with `job_output`; set `run_in_background: false` to wait for the text. Background mode requires `@deepseek-ai/dsh-jobs-local` and `@deepseek-ai/dsh-tool-jobs`.

Each tool accepts one free-form `query` string; `ctx.literature.resolve()` recognizes the identifier kind. The full-text fallback (`subagentProvider`, default `spawn`) requires the `subagents` service with a provider supporting `outputSchema` and `toolFilter` at call time; without it, DOI-only and landing-page inputs report `LITERATURE_FULLTEXT_UNAVAILABLE`.

## Model Experience

### literature_search

#### What the model sees

The `literature_search` tool schema and rendered paper list; each record carries `id`, `title`, `authors`, `year`, `venue`, `doi`, `arxivId`, `published`, `sources`, and links ([tool catalog](../../../docs/tool-catalog.md#literature_search)).

#### Token effect

Conditional: one line per returned paper plus a truncation footer, bounded by `maxResults`.

#### KV Cache effect

Independent of other requests; each call is a fresh search.

### literature_bibtex

#### What the model sees

The `literature_bibtex` tool schema and one fenced `bibtex` block with a provenance caveat ([tool catalog](../../../docs/tool-catalog.md#literature_bibtex)).

#### Token effect

Fixed: one BibTeX entry plus an optional one-line note.

#### KV Cache effect

Independent of other requests.

### literature_fulltext

#### What the model sees

The `literature_fulltext` tool schema and a bounded summary plus the persisted file paths ([tool catalog](../../../docs/tool-catalog.md#literature_fulltext)). The result is always extracted body text; the DOI/landing-page fallback runs a zero-tool subagent over the bounded minified landing-page HTML (style/comments/whitespace stripped; inline scripts and header/footer/nav content retained for link discovery) and returns the extracted PDF text in the same shape. The call runs in the background by default and returns `{ kind: 'background', jobId }`; `job_output` later returns the same summary-plus-files text, and `run_in_background: false` returns it directly.

#### Token effect

Bounded by the seam's `summaryMaxChars` for the returned summary; extracted file bodies are written to disk, not echoed into the prompt. The fallback additionally spends one small subagent call (the bounded landing page, capped by the seam's `landingPageMaxChars`).

#### KV Cache effect

Independent of other requests; the fallback subagent is a fresh child session.

## Known Limitations and Deferred Work

- Full text is persisted as extracted text files (Markdown, plain text, or raw `.tex`), not a rendered document; LaTeX rendering is deferred.
- The DOI fallback needs the `subagents` service and a provider supporting `outputSchema`/`toolFilter`; without them it reports `LITERATURE_FULLTEXT_UNAVAILABLE`. The subagent reads only the bounded minified landing-page HTML, so a PDF link outside the bound (default 20 000 characters) is not found — pass the explicit PDF URL in that case.
- Publishers behind bot walls cannot be fetched: dl.acm.org returns 403 to non-browser clients, so ACM-DL DOIs fail at the landing-page fetch. Publisher PDF downloads are also slow in practice (measured 25–60 s on CCF-A landing pages); the seam default `timeoutMs` is 60 s, and the tool's background-by-default mode keeps such downloads from blocking the turn.

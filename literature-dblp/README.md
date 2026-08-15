# @shlv/dsh-literature-dblp

English | [中文](README.zh.md)

The **dblp source provider** for the literature seam: keyword search via the JSON search API, exact-key lookup via the record XML, per-record BibTeX via `/rec/<key>.bib?param=1`, and the CoRR↔arXiv key bridge. Registers a `LiteratureSource` with id `dblp` on `ctx.literature`.

## Endpoints

- Search: `GET <base>/search/publ/api?q=…&format=json&h=…&f=0` → normalized hits (key, title, authors, venue, year, type, access, doi, ee, url).
- Lookup: `GET <base>/rec/<key>.xml` → a formal or CoRR record.
- BibTeX: `GET <base>/rec/<key>.bib?param=1` → formatted BibTeX; the source labels it `dblp-formal` (published) or `dblp-corr` (the CoRR preprint mirror).

A CoRR key `journals/corr/abs-YYMM-NNNNN` derives the arXiv id `YYMM.NNNNN`; the search `info.type` (`Conference and Workshop Papers`/`Journal Articles` versus `Informal and Other Publications`) distinguishes formal from preprint records.

## Model Experience

Indirectly, through `dsh-tool-literature`, which renders this source's records, BibTeX, and metadata into the model-facing tools.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- The CoRR bridge covers only arXiv `cs.*` categories; dblp exposes no arXiv id for non-CS preprints, so cross-matching falls back to DOI or title.
- Polite rate limiting is enforced by the provider config (`rateLimitMs`); there is no official dblp quota, so a deployment can still be throttled. A throttled search reports `LITERATURE_RATE_LIMITED` (and other non-200 searches `LITERATURE_FETCH_FAILED`) instead of silently returning empty results; exact-key lookups and BibTeX keep returning `null` for a non-200 response, since a missing record and a throttled lookup are both resolved through the seam's fallback chain.

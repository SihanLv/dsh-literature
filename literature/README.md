# @shlv/dsh-literature

Install bundle for the [dsh-literature family](../README.md): one `dsh plugin add` installs the seam (`ctx.literature`), the dblp and arXiv providers, and the model-facing `literature_search` / `literature_bibtex` / `literature_fulltext` tools.

```sh
dsh plugin --profile headless add @shlv/dsh-literature
dsh plugin --profile web add @shlv/dsh-literature
```

This package carries no code of its own — it depends on the four functional packages and ships `cordis.patch.yml`, the layer that mounts them.

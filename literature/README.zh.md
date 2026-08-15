# @shlv/dsh-literature

[dsh-literature 系列](../README.zh.md)的安装 bundle：一条 `dsh plugin add` 即可安装 seam（`ctx.literature`）、dblp 与 arXiv 两个提供方，以及面向模型的 `literature_search` / `literature_bibtex` / `literature_fulltext` 工具。

```sh
dsh plugin --profile headless add @shlv/dsh-literature
dsh plugin --profile web add @shlv/dsh-literature
```

本包自身不含代码——它依赖四个功能包并携带 `cordis.patch.yml`，即挂载它们的配置层。

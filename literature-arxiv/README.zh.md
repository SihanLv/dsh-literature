# @shlv/dsh-literature-arxiv

[English](README.md) | 中文

文献 seam 的 **arXiv 来源提供方**：Atom 搜索、精确 id 查找、单条 BibTeX，以及全文工件下载（LaTeX 源码包、HTML、PDF）。在 `ctx.literature` 上注册 id 为 `arxiv` 的 `LiteratureSource`。

## Endpoints

- 搜索／查找：`GET <apiBase>/api/query?search_query=…` / `?id_list=…` → Atom 条目（id、title、summary、updated、authors、`arxiv:doi`、`arxiv:journal_ref`）。
- BibTeX：`GET <wwwBase>/bibtex/<id>`（arXiv 引用；注意其 `year` 可能反映最新版本）。
- 全文：`GET <wwwBase>/e-print/<id>`（源码包）、`/html/<id>`（HTML5，非每篇都有）、`/pdf/<id>`（PDF）。

## 模型体验

间接通过 `dsh-tool-literature` 呈现——它将本来源的记录、BibTeX 与提取的全文渲染进面向模型的工具。

#### KV Cache 影响

无直接影响；命名消费者拥有任何请求前缀变化。

## 已知限制与暂缓事项

- HTML5 渲染仅对部分论文存在；provider 对其余 kind 返回 `null`，seam 据此回退。
- arXiv BibTeX 的 `year` 可能反映最新版本而非原始提交；因此 seam 优先使用 dblp CoRR BibTeX。记录的 `year` 使用 Atom `published`（首次提交）日期，不会随后续修订漂移。
- 礼貌限流（默认 `rateLimitMs` 3000，arXiv 文档规定的 3 秒间隔）串行化同一 source 实例的所有请求；429／503 响应会以指数退避（`rateLimitBackoffBaseMs × 2^retry`，默认基数 3000）重试，上限 `rateLimitBackoffMaxRetries`（默认 5）。重试预算耗尽后仍被限流的搜索上报 `LITERATURE_RATE_LIMITED`，而非静默返回空结果。

# @shlv/dsh-literature-dblp

[English](README.md) | 中文

文献 seam 的 **dblp 来源提供方**：通过 JSON 搜索 API 做关键词搜索、通过记录 XML 做精确 key 查找、通过 `/rec/<key>.bib?param=1` 取单条 BibTeX，并提供 CoRR↔arXiv key 桥。在 `ctx.literature` 上注册 id 为 `dblp` 的 `LiteratureSource`。

## Endpoints

- 搜索：`GET <base>/search/publ/api?q=…&format=json&h=…&f=0` → 归一化命中（key、title、authors、venue、year、type、access、doi、ee、url）。
- 查找：`GET <base>/rec/<key>.xml` → 正式或 CoRR 记录。
- BibTeX：`GET <base>/rec/<key>.bib?param=1` → 格式化 BibTeX；来源将其标记为 `dblp-formal`（已录用）或 `dblp-corr`（CoRR 预印本镜像）。

CoRR key `journals/corr/abs-YYMM-NNNNN` 反推出 arXiv id `YYMM.NNNNN`；搜索 `info.type`（`Conference and Workshop Papers`／`Journal Articles` 对 `Informal and Other Publications`）区分正式与预印本记录。

## 模型体验

间接通过 `dsh-tool-literature` 呈现——它将本来源的记录、BibTeX 与元数据渲染进面向模型的工具。

#### KV Cache 影响

无直接影响；命名消费者拥有任何请求前缀变化。

## 已知限制与暂缓事项

- CoRR 桥仅覆盖 arXiv 的 `cs.*` 类目；dblp 不为非 CS 预印本暴露 arXiv id，因此交叉匹配回退到 DOI 或标题。
- 礼貌限流由 provider 配置（`rateLimitMs`）强制；dblp 无官方配额，部署仍可能被限流。被限流的搜索上报 `LITERATURE_RATE_LIMITED`（其他非 200 搜索上报 `LITERATURE_FETCH_FAILED`），而非静默返回空结果；精确 key 查找与 BibTeX 对非 200 响应继续返回 `null`，因为"无此记录"与"查找被限流"都会经由 seam 的回退链解决。

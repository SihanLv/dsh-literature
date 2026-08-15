# @shlv/dsh-literature

[English](README.md) | 中文

**文献调研 seam**（`ctx.literature`）：覆盖 dblp（正式录用记录 + CoRR 预印本镜像）与 arXiv（预印本）的来源注册表与提供方合并服务。本包拥有服务定义角色——来源注册表、合并／去重／回退策略、记录解析、全文策略、共享的 SSRF 防护 HTTP 传输、提取辅助函数以及 `LiteratureError` 分类。

## Service API（`ctx.literature`）

| Member | Semantics |
|---|---|
| `registerSource(source)` | 注册来源（id 为 `dblp` 或 `arxiv`）。拒绝重复 id。返回 disposer。 |
| `search(request, signal?)` | 并行运行所有被选中的 `available()` 来源并合并归一化命中。 |
| `resolveRecord(input, signal?)` | 将标题、arXiv id、dblp key、CoRR key 或 DOI 解析为一条合并记录；精确标识符（arXiv id、dblp key、DOI）优先返回携带该标识符的记录，标题查询拉取完整 dblp 命中列表与 arXiv 短语搜索，并按 BM25 标题相似度对合并记录排序。 |
| `bibtex(input, signal?)` | 选择 BibTeX 条目：正式 dblp 记录、arXiv（预印本的规范 `@misc`）、dblp CoRR 镜像依次优先。 |
| `fulltext(input, signal?)` | 按优先级获取全文（arXiv 源码包 → HTML → PDF，然后显式 PDF URL）；无产物时抛 `LITERATURE_FULLTEXT_UNAVAILABLE`。 |
| `landingPage(input, signal?)` | 按 DOI 或 URL 抓取出版商落地页并返回其有界、压缩后的 HTML（上限为 `landingPageMaxChars`）：去除样式、注释与空白，保留内联脚本与页头／页脚／导航／noscript 内容，使其中任一位置的 PDF 链接都能到达子代理。 |

配置了 `enabledSources` 时按它选择；否则运行所有已注册且 `available()` 的来源。单个被限流的来源不会拖垮整个搜索：`LITERATURE_RATE_LIMITED`（429/503）或 `LITERATURE_FETCH_FAILED` 的搜索响应经由 seam 的按来源容错上报，仅当所有选中的来源都失败时搜索才会明确失败。

## 合并与回退策略

- **去重**按 arXiv id（存在时从 dblp CoRR key `journals/corr/abs-YYMM-NNNNN` 反推）、其次出版商 DOI、最后归一化标题来识别同一篇论文。DOI 不同不是决定性的：CoRR 镜像携带 arXiv DataCite DOI（`10.48550/…`），而正式记录携带出版商 DOI。
- **合并**优先正式 dblp 记录的 venue／year／DOI／BibTeX，并从 CoRR 镜像或 arXiv 命中保留 arXiv id。
- **BibTeX** 优先正式 dblp 记录；尚未发表的预印本取 arXiv `@misc`（引用形态正确，不同于 dblp CoRR 的 `@article`-in-`CoRR` 伪产物），dblp CoRR 镜像仅作最后兜底。
- **全文**优先 arXiv LaTeX 源码包、其次 arXiv HTML、再次 arXiv PDF、最后显式 PDF URL。对仅含 DOI 的记录（或落地页 URL），消费者通过子代理基于 `landingPage` 输出解析出版商 PDF 链接；seam 自身保持纯检索，无产物时报告 `LITERATURE_FULLTEXT_UNAVAILABLE`。

## 模型体验

间接通过 `dsh-tool-literature` 呈现——它拥有面向模型的工具 schema、文案与结果渲染；本注册表自身不贡献提示词或 schema。

#### KV Cache 影响

无直接影响；命名消费者拥有任何请求前缀变化。

## 已知限制与暂缓事项

- **SSRF／私网屏蔽暂缓**，与 web fetch provider 一致：仅强制 http(s)、无内嵌凭据、同源重定向，按需最多允许一次跨域跳转（`doi.org` 解析器，以及发布商链接重定向到 CDN 的显式 PDF／落地页抓取）（[web 能力 Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)）。
- **LaTeX → 正文是有损的**：源码包摘要只是剥离命令／注释，并非渲染后的文档。完整 LaTeX 渲染暂缓。
- **CoRR 桥仅覆盖 arXiv 的 `cs.*` 类目**；非 CS 论文依赖 DOI 或标题匹配。

# @shlv/dsh-literature-tool

[English](README.md) | 中文

基于 `ctx.literature` 的面向模型文献工具：`literature_search`、`literature_bibtex` 与 `literature_fulltext`。本包拥有工具名称、schema、校验与呈现；文献 seam 拥有检索、合并与回退。

## Usage

- `literature_search` — 查询 dblp 与 arXiv，合并／去重，返回带稳定 id 的记录。
- `literature_bibtex` — 将标题、arXiv id、dblp key 或 DOI 解析为 BibTeX 条目（正式 dblp → arXiv `@misc` → dblp CoRR 镜像）。
- `literature_fulltext` — 获取全文（arXiv 源码包 → HTML → PDF → 经子代理解析的出版商 PDF）并把提取的文本文件写入会话工作区 `literature/<id>/`。获取过程（包括缓慢的出版商 PDF）默认作为 `ctx.jobs` 任务在后台运行，用 `job_output` 收集；设 `run_in_background: false` 可等待文本。后台模式需要 `@deepseek-ai/dsh-jobs-local` 与 `@deepseek-ai/dsh-tool-jobs`。

每个工具接受一个自由形式的 `query` 字符串；`ctx.literature.resolve()` 识别标识符类型。全文回退（`subagentProvider`，默认 `spawn`）在调用时需要 `subagents` 服务以及支持 `outputSchema` 与 `toolFilter` 的 provider；缺少时，仅含 DOI 与落地页 URL 的输入报告 `LITERATURE_FULLTEXT_UNAVAILABLE`。

## 模型体验

### literature_search

#### 模型看到什么

`literature_search` 工具 schema 与渲染出的论文列表；每条记录含 `id`、`title`、`authors`、`year`、`venue`、`doi`、`arxivId`、`published`、`sources` 与链接（[工具目录](../../../docs/tool-catalog.md#literature_search)）。

#### Token 影响

条件式：每篇论文一行加截断脚注，受 `maxResults` 限制。

#### KV Cache 影响

与其他请求相互独立；每次调用都是一次全新搜索。

### literature_bibtex

#### 模型看到什么

`literature_bibtex` 工具 schema 与一个 fenced `bibtex` 块及来源提示（[工具目录](../../../docs/tool-catalog.md#literature_bibtex)）。

#### Token 影响

固定：一个 BibTeX 条目加可选的一行提示。

#### KV Cache 影响

与其他请求相互独立。

### literature_fulltext

#### 模型看到什么

`literature_fulltext` 工具 schema 与有界摘要及落盘文件路径（[工具目录](../../../docs/tool-catalog.md#literature_fulltext)）。结果始终是提取出的正文；DOI／落地页回退在零工具子代理上运行有界的精简落地页 HTML（去除样式／注释／空白；保留内联脚本与页头／页脚／导航内容以便发现链接），并以相同形态返回提取出的 PDF 文本。调用默认在后台运行并返回 `{ kind: 'background', jobId }`；`job_output` 之后返回同样的摘要＋文件列表文本，`run_in_background: false` 则直接返回。

#### Token 影响

返回的摘要受 seam 的 `summaryMaxChars` 限制；提取的文件正文写入磁盘，不回显进提示词。回退额外消耗一次小的子代理调用（有界落地页，上限为 seam 的 `landingPageMaxChars`）。

#### KV Cache 影响

与其他请求相互独立；回退子代理是一次全新的子会话。

## 已知限制与暂缓事项

- 全文以提取出的文本文件（Markdown、纯文本或原始 `.tex`）落盘，而非渲染后的文档；LaTeX 渲染暂缓。
- DOI 兜底需要 `subagents` 服务与支持 `outputSchema`／`toolFilter` 的 provider；缺少时报告 `LITERATURE_FULLTEXT_UNAVAILABLE`。子代理只读有界的精简落地页 HTML，超出边界（默认 20 000 字符）的 PDF 链接无法被发现——此时请直接传显式 PDF URL。
- 处于 bot 墙后的出版商无法抓取：dl.acm.org 对非浏览器客户端返回 403，因此 ACM-DL 的 DOI 在落地页抓取这步即失败。出版商 PDF 下载实际也很慢（在 CCF-A 落地页上实测 25–60 秒）；seam 默认 `timeoutMs` 为 60 秒，工具默认后台运行的模式可让此类下载不阻塞回合。

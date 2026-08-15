# dsh-literature — DeepSeek Harness 文献调研插件

[English](README.md) | 中文

**源码：** [github.com/SihanLv/dsh-literature](https://github.com/SihanLv/dsh-literature)

**一次查询，同时覆盖 dblp 与 arXiv。** 面向 DeepSeek Harness 的文献调研能力：同时检索两个数据库，每篇论文只返回一条合并记录，取到最权威的 BibTeX，以及存在的全文——模型无需自己在两库之间来回切换。

把 `@shlv/dsh-literature` 装入任意 profile（Web 或 Headless），即可获得三个面向模型的工具：`literature_search`、`literature_bibtex` 与 `literature_fulltext`。

## 为什么需要它

学术检索分散在两个覆盖互补的数据库：**dblp** 收录正式发表的记录（外加 arXiv `cs.*` 预印本的 CoRR 镜像），**arXiv** 收录 dblp 同步滞后的预印本。让模型自己查两个库再对账，既浪费 token 又产生不一致的引用。这个 seam 一次性完成对账：去重、权威来源优先、回退，都是策略而非提示词工程。

## 亮点

- **每篇论文一条合并记录。** dblp CoRR 镜像、正式发表记录与 arXiv 预印本合并为一条记录——按 arXiv id（必要时从 CoRR key 反推）、其次出版商 DOI、最后归一化标题去重。
- **自动选择权威 BibTeX。** 已发表论文优先正式 dblp 条目；尚未发表的预印本取引用形态正确的 arXiv `@misc`；dblp CoRR 镜像仅作最后兜底。不再把镜像伪产物当作正式记录引用。
- **有全文就取全文。** 依次获取 arXiv LaTeX 源码包、HTML5 渲染、PDF；对仅含 DOI 或落地页的引用，通过零工具子代理解析出版商 PDF 链接并提取正文。
- **模型可复用的稳定 id。** 每条合并记录携带合成 `id`（`arxiv:…`、`dblp:…`、`doi:…`、`title:…`），模型可直接回传给 `literature_bibtex` / `literature_fulltext`。
- **精确的标题解析。** 标题查询拉取完整 dblp 命中列表加短语引号 arXiv 搜索，再按 BM25 标题相似度重排——即使有更新的同主题论文排在前，你要找的论文仍会胜出。
- **慢下载不阻塞回合。** `literature_fulltext` 默认作为 `ctx.jobs` 后台任务运行并立即返回 job id，用 `job_output` 收集结果。发布商站点上实测 25–60 秒的下载不会拖住 agent 循环。
- **加固的传输层。** 所有请求共享一层 SSRF 防护 HTTP：URL 卫生、禁止内嵌凭据、同源重定向且最多一次跨域跳转、字节上限、协作式超时。
- **默认礼貌限流。** 两个提供方都通过限速器串行请求（arXiv 按其文档规定的 3 秒间隔，429/503 带指数退避）；单个被限流的来源不会拖垮整个搜索。

## 架构

系列沿用 DeepSeek Harness 的能力 seam 模式——服务定义 / 提供方 / 消费方，后置一个可安装的聚合 bundle：

| 包 | 角色 | 注册点 |
|---|---|---|
| `@shlv/dsh-literature`（bundle） | **安装 bundle**：你只需 `dsh plugin add` 这一个包；它依赖四个功能包并携带挂载它们的 patch | profile bundle 层 |
| `@shlv/dsh-literature-core` | **服务定义**（`ctx.literature`）：来源注册表、合并／去重／回退策略、记录解析、全文策略、共享 HTTP 传输、提取辅助、`LiteratureError` 分类 | `ctx.literature` |
| `@shlv/dsh-literature-dblp` | **dblp 来源提供方**：搜索 API、记录 XML 查找、按记录 BibTeX、CoRR↔arXiv key 桥 | 在 `ctx.literature` 注册来源 |
| `@shlv/dsh-literature-arxiv` | **arXiv 来源提供方**：Atom 搜索、精确 id 查找、BibTeX、全文产物下载 | 在 `ctx.literature` 注册来源 |
| `@shlv/dsh-literature-tool` | **消费方**：三个面向模型的工具、schema、呈现、出版商 PDF 链接的子代理回退 | `ctx.tools` |

你只需安装 bundle，其余四个是它的依赖。两个来源共享一个 dblp 优先策略的 seam，因为它们独立演进：全文机制（tar、pdf.js）不能拖累 dblp 提供方，而且只加载一个提供方的部署仍能得到可用的搜索。

## 快速开始

```sh
dsh plugin --profile headless add @shlv/dsh-literature
dsh plugin --profile web add @shlv/dsh-literature
```

一条命令装上整个系列。在带 `DEEPSEEK_API_KEY` 的源码 checkout 中，改用仓库自带 patch 挂载：

```sh
cd deepseek-harness   # 一个 dsh checkout
pnpm dsh --profile headless --patch /path/to/dsh-literature/literature.patch.yml \
  "搜索 'Attention is all you need'，获取其 BibTeX，再下载全文"
```

## 环境要求

- DeepSeek Harness `0.1.0-rc.6` 或兼容的后续版本（插件在该版本线声明 `@deepseek-ai/dsh-*` peer）。
- Node.js `^22.19` 或 `>=24`。
- `literature_fulltext` 的后台模式还需要 `@deepseek-ai/dsh-jobs-local` 与 `@deepseek-ai/dsh-tool-jobs`。
- 出版商 PDF 回退需要带支持 `outputSchema` 的 provider 的 `subagents` 服务（默认 `spawn`）。缺少时，仅含 DOI 与落地页的输入报告 `LITERATURE_FULLTEXT_UNAVAILABLE`；搜索、BibTeX 与 arXiv 全文仍可用。

## 安装与生命周期

```sh
dsh plugin --profile headless add @shlv/dsh-literature      # 安装
dsh plugin --profile headless remove @shlv/dsh-literature   # 卸载
```

**升级。** 发布新版本后，`dsh plugin add` 可能仍装到旧版本，因为 pnpm 会缓存 registry 元数据。请用显式版本安装，或先清元数据缓存：

```sh
dsh plugin --profile headless add @shlv/dsh-literature@0.1.1
# 或：pnpm cache clean
```

## 工具

| 工具 | 功能 |
|---|---|
| `literature_search` | 查询 dblp 与 arXiv，合并／去重，返回带稳定 id、源生标题、venue、DOI、arXiv id 与摘要的记录。 |
| `literature_bibtex` | 将标题、arXiv id、dblp key 或 DOI 解析为一条 BibTeX 条目——正式 dblp → arXiv `@misc` → dblp CoRR 镜像；年份依赖版本时附来源说明。 |
| `literature_fulltext` | 获取全文（arXiv 源码 → HTML → PDF → 经子代理的出版商 PDF）并把提取的文件写入会话工作区 `literature/<id>/`。默认后台运行；返回有界摘要与文件路径。 |

每个工具接受一个自由形式的 `query` 字符串；seam 自动识别它是标题、arXiv id、dblp key、DOI 还是 URL。

## 服务 API（`ctx.literature`）

| 成员 | 语义 |
|---|---|
| `registerSource(source)` | 注册来源（`dblp` 或 `arxiv`）；拒绝重复；返回注销函数。 |
| `search(request, signal?)` | 并行运行每个选中的可用来源并合并归一化命中。 |
| `resolveRecord(input, signal?)` | 将标题、arXiv id、dblp key、CoRR key 或 DOI 解析为一条合并记录；精确标识符优先于模糊标题匹配。 |
| `bibtex(input, signal?)` | 选择最权威的 BibTeX 条目（正式 dblp → arXiv → CoRR 镜像）。 |
| `fulltext(input, signal?)` | 按优先级获取全文（arXiv 源码 → HTML → PDF → 显式 PDF URL）；无产物时抛 `LITERATURE_FULLTEXT_UNAVAILABLE`。 |
| `landingPage(input, signal?)` | 按 DOI 或 URL 抓取出版商落地页并返回有界、压缩后的 HTML 供 PDF 链接分析。 |

## 合并与回退策略

- **去重**按 arXiv id（存在时从 dblp CoRR key `journals/corr/abs-YYMM-NNNNN` 反推）、其次出版商 DOI、最后归一化标题识别同一篇论文。DOI 不同不是决定性的：CoRR 镜像携带 arXiv DataCite DOI（`10.48550/…`），而正式记录携带出版商 DOI。
- **合并**优先正式 dblp 记录的 venue／year／DOI／BibTeX，并从 CoRR 镜像或 arXiv 命中保留 arXiv id。
- **BibTeX** 优先正式 dblp 记录；尚未发表的预印本取 arXiv `@misc`（引用形态正确，不同于 dblp CoRR 的 `@article`-in-`CoRR` 伪产物），dblp CoRR 镜像仅作最后兜底。
- **全文**优先 arXiv LaTeX 源码包、其次 arXiv HTML5、再次 arXiv PDF、最后显式 PDF URL。某个产物种类失败会落到下一种（纯 PDF 提交的论文其 `/e-print` 返回 PDF 时，仍会经 `/pdf` 解析成功）。

## 配置

每个包都通过 cordis.yml 行接受校验过的配置；所有值都有默认值并可在部署时调整。

| 包 | 关键选项（默认值） |
|---|---|
| `literature-core` | `enabledSources`（全部已注册）、`searchMaxResults`（10）、`timeoutMs`（60 000）、`downloadMaxBytes`（100 MB）、`extractMaxChars`（200 000）、`summaryMaxChars`（4000）、`landingPageMaxChars`（20 000）、`maxRedirects`（5）、`maxUrlLength`（2048）、`userAgent` |
| `literature-dblp` | `baseUrl`（`https://dblp.org`）、`timeoutMs`（30 000）、`maxResponseBytes`（5 MB）、`rateLimitMs`（1000）、`userAgent` |
| `literature-arxiv` | `apiBase`（`https://export.arxiv.org`）、`wwwBase`（`https://arxiv.org`）、`timeoutMs`（30 000）、`maxResponseBytes`（100 MB）、`rateLimitMs`（3000）、`rateLimitBackoffBaseMs`（3000）、`rateLimitBackoffMaxRetries`（5） |
| `literature-tool` | `subagentProvider`（`spawn`） |

## 模型体验

工具保持模型上下文精简：`literature_search` 每篇论文一行并带截断页脚，`literature_bibtex` 一个围栏代码块加可选说明，`literature_fulltext` 返回有界摘要，提取的正文写入磁盘而非回显进提示词。seam 自身不贡献提示词或 schema；消费方拥有所有模型可见文案。

## 故障排查

- **安装后插件加载失败**（"Cannot find module … `lib/error.js`"）：安装的包缺少运行时模块。请重装最新版本（`dsh plugin --profile headless add @shlv/dsh-literature@<版本>`）；只打包 `lib/index.js` 的 tarball 是坏的。
- **`dsh plugin add` 装到旧版本**：pnpm 的 registry 元数据缓存。用显式版本或 `pnpm cache clean`（见[安装与生命周期](#安装与生命周期)）。
- **仅含 DOI 的论文报告 `LITERATURE_FULLTEXT_UNAVAILABLE`**：缺少 `subagents` 服务或配置的 provider，或发布商屏蔽非浏览器客户端（dl.acm.org 返回 403）。此时请传入显式 PDF URL。
- **老论文的 arXiv 全文缺失**：HTML5 渲染仅对部分论文存在；seam 会回退到 PDF，而 PDF 需要发布商侧源码。

## 开发与验证

```sh
pnpm install && pnpm run build && pnpm run typecheck && pnpm run test
```

仓库布局、依赖策略、发布流程与完整验证清单见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

## 已知限制

- **发布商机器人墙**：dl.acm.org 对非浏览器客户端返回 403，ACM-DL 的 DOI 会在落地页抓取阶段失败。
- **arXiv HTML5 渲染仅对部分论文存在**；provider 对其余种类返回 `null`，seam 据此回退。
- **CoRR 桥仅覆盖 arXiv 的 `cs.*` 类目**；非 CS 论文依赖 DOI 或标题匹配。
- **LaTeX → 正文是有损的**：源码包摘要只是剥离命令与注释，并非渲染后的文档。
- **SSRF／私网屏蔽暂缓**，与 web fetch provider 一致：仅 http(s)、无内嵌凭据、同源重定向且最多一次跨域跳转。

## 许可

MIT

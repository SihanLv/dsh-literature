# 为 dsh-literature 做贡献

欢迎提交聚焦的修复、测试、provider 改进与文档改动。本文件覆盖独立仓库的开发设置、依赖策略与发布流程；[README](README.zh.md) 是面向使用者的手册。

## 仓库布局

五个包组成一个 pnpm workspace；每个目录名与其 `@shlv` 包名一致：

| 目录 | 包 | 角色 |
|---|---|---|
| `literature/` | `@shlv/dsh-literature` | 安装 bundle：用户 `dsh plugin add` 的唯一入口；声明四个功能包并携带 `cordis.patch.yml` |
| `literature-core/` | `@shlv/dsh-literature-core` | 服务定义（`ctx.literature`）：来源注册表、合并／去重／回退策略、记录解析、全文策略、共享 HTTP 传输、提取辅助 |
| `literature-dblp/` | `@shlv/dsh-literature-dblp` | dblp 来源提供方 |
| `literature-arxiv/` | `@shlv/dsh-literature-arxiv` | arXiv 来源提供方 |
| `literature-tool/` | `@shlv/dsh-literature-tool` | 面向模型的工具（`literature_search` / `literature_bibtex` / `literature_fulltext`） |

## 开发设置

```sh
pnpm install          # 从 npm 安装宿主 dev 依赖；五个包作为 workspace 互链
pnpm run build        # tsc，包序：core → 提供方 → tool（bundle 无 src）
pnpm run typecheck    # 先 core，再对其余依赖包 --noEmit
pnpm run test         # vitest —— 221 个测试，含真实 API 的性能探针
```

`vitest.config.ts` 将功能包别名到各自 `src`，测试无需先构建即可直接跑源码；`tsc` 通过各包构建出的 `lib/types` 解析包间类型。

本仓库是 `deepseek-harness/packages/literature` 的独立快照。请手动保持两边同步；seam 的决策记录位于主 checkout 的 `.agents/notes/implemented/architecture/2026-08-14-literature-capability-seam.md`。

## 依赖策略

独立仓库沿用已发布插件的模式（参见 `dsh-vision-toolkit`）：

- **宿主依赖作为 peer。** `@deepseek-ai/dsh-*`（`^0.1.0-rc.6`）、`@deepseek-ai/cordis`（`^4.0.1`）、`@deepseek-ai/schemastery`（`^3.18.1`）由加载插件的 Harness 运行时提供；各包不自装副本。
- **bundle 是安装面。** `@shlv/dsh-literature` 把四个功能包声明为 `dependencies`，`dsh plugin add @shlv/dsh-literature` 一次装完整个系列。
- **包间引用使用 `workspace:^`。** 功能包组成一个 pnpm workspace；`pnpm publish` 自动把 `workspace:` 说明改写为发布版本。
- **dev 依赖钉住 registry 版本**，使 `pnpm install && pnpm run test` 可独立运行。

## 发布

五个包按依赖顺序发布——先 `@shlv/dsh-literature-core`（seam），再 `@shlv/dsh-literature-dblp` 与 `@shlv/dsh-literature-arxiv`，然后 `@shlv/dsh-literature-tool`，最后发布 `@shlv/dsh-literature` bundle。五个包共享同一个版本号，需一起 bump（例如 `pnpm -r version patch`，或手工改五个 `version` 字段）。

**自动发布（推荐）。** `.github/workflows/release.yml` 会替你完成发布。前置：一个对 `@shlv` scope 有发布权限的 npm automation token，存为仓库 `NPM_TOKEN` secret（GitHub → Settings → Secrets and variables → Actions）。然后：

```sh
pnpm -r version patch                # 五个包一起 bump 版本
git add -A && git commit -m "release: v0.1.2"
git push
git tag v0.1.2 && git push origin v0.1.2   # 触发 workflow
```

workflow 会：checkout、安装依赖、跑 typecheck／test／build，校验五个版本与 tag 一致、校验每个 tarball 携带运行时模块，然后按依赖顺序发布五个包，并用自动生成的说明创建 GitHub Release。`workflow_dispatch` 手动触发时跳过 tag 校验。

**手动发布。** 也可以从本地 checkout 发布（先 `npm login`——你必须拥有 `@shlv` scope）：

```sh
cd literature-core && pnpm publish && cd ..    # ① seam
cd literature-dblp && pnpm publish && cd ..    # ②
cd literature-arxiv && pnpm publish && cd ..   # ③
cd literature-tool && pnpm publish && cd ..    # ④
cd literature && pnpm publish && cd ..         # ⑤ bundle，最后
```

每次 `pnpm publish` 都会运行 `prepack` 构建（tsc），并把包间 `workspace:^` 说明改写为发布版本。顺序至关重要：bundle 的 `dependencies` 是 `^0.1.x`，四个功能包必须先存在于 registry。

**发布前**，在每个包内运行 `npm pack --dry-run`，确认 tarball 携带完整的 `lib/` 树。tsc 构建是每个源码模块一个 js（`lib/error.js`、`lib/merge.js`、…），因此 `files` 必须是 `["lib"]`——主仓库基于 tsdown 的单文件白名单会发布一个运行时无法加载的 tarball（`0.1.0` 正是因此损坏）。

**发布新版本后**，`dsh plugin add` 可能仍装到旧版本，因为 pnpm 会缓存 registry 元数据。请用显式版本安装（`dsh plugin add @shlv/dsh-literature@0.1.1`），或先清元数据缓存（`pnpm cache clean`）。

## 验证

- `pnpm run typecheck` 与 `pnpm run test` 必须通过（221 个测试，含真实 API 的性能探针）。
- 对每个功能包运行 `npm pack --dry-run`，tarball 必须列出全部 `lib/*.js` 模块。
- 真实 profile 验收：`dsh plugin --profile headless add @shlv/dsh-literature`，然后 `dsh --profile headless --dump-config` 显示四个插件行，并在带 key 时跑通 `literature_search` → `literature_bibtex` → `literature_fulltext`。

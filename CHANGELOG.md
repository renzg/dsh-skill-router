# 变更记录

版本号遵循语义化版本。本仓库从 `0.2.4` 起公开，此前版本为内部迭代。

## 0.5.1 — 2026-11-20

- **npm 发布**：包名定为 `@zhiyu.pub/dsh-skill-router`，公开于 npm。
- CI 的 npm 发布步骤改为**幂等**：版本已存在则跳过，重跑流水线不再必然失败。
- 包名、客户端模块 id、`cordis.patch.yml`、README 安装命令统一为 `@zhiyu.pub/dsh-skill-router`。

## 0.5.0 — 2026-11-20

- 包名从 `dsh-skill-router` 改为 scope 版（原名字已于 2026-09-15 被他人占用在 npm 发布，同名同领域）。
- 关闭 `private`，加 `publishConfig.access = public`。

## 0.4.2 — 2026-11-20

- 新增 `.github/workflows/release.yml`：推 `v*` tag 时自动跑测试、`npm pack`、建 GitHub Release 并挂 tarball（已存在则 `--clobber` 更新）。
- `package.json` 增加 `scripts.test` / `scripts.pack`，无需任何依赖即可跑。

## 0.4.1 — 2026-11-20

- 「建议安装」行增加**官方简介**（`desc` 字段，40–60 字，取自官方 bundle / npm 的 description），便于识别该技能做什么。
- 布局改为四层：名称 / 简介 / 为什么这次需要 / 安装命令。
- 缺 `desc` 的旧标记仍可解析，不崩、不留空行。

## 0.4.0 — 2026-11-20

- **路由前先查官方目录**：查 `plugin_manager list_bundles` 的 `official` 条目与 npm 上的官方 skill 包，再看本地三处（`~/.dsh/skills`、已装包 `skills/`、`plugin_manager list_plugins`）。
- 官方有、本地没有 → 面板出现「建议安装」行，附可复制的安装命令。
- 两端通过回复里的隐藏标记 `<!-- skill-router:suggest … -->` 通信；面板读不到本地安装状态，判定由 agent 完成。

## 0.3.1 — 2026-11-20

- 仓库更名为 `renzg/dsh-skill-router`，同步 remote、`repository/homepage/bugs`、面板 Star 链接。
- `docs/` 增加两张演示图，中英 README 各加「演示」小节。

## 0.3.0 — 2026-11-20

- 技能 id 由 `skill-router` 改为 `dsh-skill-router`（provider 同步）。
- 点赞后，有已知仓库的技能出现 **⭐ Star** 链接。
- README 拆为英文主档 + `README.zh-CN.md`，双向语言切换。

## 0.2.4 — 2026-11-20

- 首次公开到 GitHub。
- 修复：`assets/routes.md` 模板误带真实路由条目，改为空模板。
- 路径修正：`index.js` 位于包根时资源路径是 `./skills/…`，此前的 `../skills/…` 会跳出包外，导致技能静默消失。

## 0.2.0 — 2026-11-20

- 面板新增「本轮最常用」Top5：名称 + 次数 + 跨会话累计 👍/👎（存 `localStorage`）。
- 一个技能一票：再点同侧撤回，改点另一侧即改票。

## 0.1.0 — 2026-11-20

- 首个版本：路由技能 + 对话页「技能」面板 + 状态目录初始化，打包为一个 bundle。

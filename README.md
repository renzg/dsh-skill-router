# dsh-skill-router

一个 DSH bundle，把三样东西装成一个包：

1. **`skill-router` 技能** —— 拆需求、匹配技能、首次确认、把结论写进路由表；同类问题下次直接复用、不再追问。
2. **对话页「skill路由」视图** —— 与「轨迹」「上下文」同一排，按轮次记录实际加载了哪些 skill、是否复用、哪次报错。
3. **状态目录初始化** —— 首次启动时在 `$DSH_HOME/skill-router/`（默认 `~/.dsh/skill-router/`）建好 `routes.md`、`log.jsonl`、`log.py`，不覆盖已有数据。

## 安装

要求 DSH `0.2.2` 线。

```bash
# 设置 → 插件 → 添加插件 → 填本地目录或 tarball 路径
dsh plugin --profile desktop add /path/to/dsh-skill-router-0.1.0.tgz
```

## 评分

面板顶部「本轮最常用」列出本轮用得最多的 5 个 skill（名称 + 次数），每一行可以点 👍 / 👎：

- 同一技能只记一票，再点一次撤回；改点另一侧即改票。
- 评分存在浏览器本地（`localStorage` 的 `skill-router.ratings.v1`），**跨会话累计**，换机器或清缓存会丢。
- 计数取当前会话已加载的那部分轨迹，很长的会话被裁剪后，旧轮次的计数可能不再计入。

## 用法

- 说一个需要动手的任务（做表格、写文档、做演示…），没点名用哪个 skill 时，`skill-router` 会把需求拆成「交付物 / 对象 / 动作 / 约束」，在当次可用 skill 里匹配，**首次只问一次**。
- 你确认后，映射写进 `~/.dsh/skill-router/routes.md`；**下次同类问题直接开工，不再问**。
- 对话页右侧标签行点「skill路由」，能看到每一轮到底加载了什么。

每次路由追加一行日志：

```bash
python3 ~/.dsh/skill-router/log.py add <<'JSON'
{"request":"…","decision":"hit","path":[{"name":"skill-router","kind":"inline"}],"loads":0,"artifacts":["…"]}
JSON
```

渲染成单页看板（可选）：

```bash
python3 ~/.dsh/skill-router/log.py render --out ./skill-execution-log.html
```

## 目录

| 路径 | 作用 |
|---|---|
| `skills/skill-router/SKILL.md` | 路由规则本体 |
| `client.js` | `conversation.view` 的「skill路由」视图 |
| `assets/routes.md` | 路由表模板（首次安装时复制） |
| `assets/log.py` | 日志追加与看板渲染脚本 |
| `index.js` | 宿主侧：注册技能 + 初始化状态目录 |

## 卸载

卸载 bundle 后，`~/.dsh/skill-router/` 会保留（路由表是你的数据）。想彻底清掉就手动删这个目录。

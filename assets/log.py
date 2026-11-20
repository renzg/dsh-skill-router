#!/usr/bin/env python3
"""skill-router 执行日志：追加记录 + 渲染单页看板。

  python3 log.py add  < record.json    # 从 stdin 追加一条
  python3 log.py render --out FILE     # 渲染 HTML 看板
"""
import argparse
import datetime
import html
import json
import os
import re
import sys
from pathlib import Path
from string import Template

HOME = Path(os.path.expanduser("~/.dsh/skill-router"))
LOG = HOME / "log.jsonl"
ROUTES = HOME / "routes.md"

DECISIONS = {
    "hit": ("命中路由表 · 免确认", "hit"),
    "first-confirm": ("首次确认", "first"),
    "new": ("无表可命中", "new"),
    "no-match": ("0 匹配", "none"),
}
KIND_LABEL = {"skill": "skill", "jump": "跳板", "inline": "已在上下文", "tool": "MCP 工具"}


def esc(value):
    return html.escape(str(value), quote=True)


def load():
    if not LOG.exists():
        return []
    records = []
    for i, line in enumerate(LOG.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except Exception as exc:
            print(f"[warn] 第 {i} 行不是合法 JSON，已跳过: {exc}", file=sys.stderr)
    return records


def parse_routes():
    if not ROUTES.exists():
        return []
    text = ROUTES.read_text(encoding="utf-8")
    block = text.split("## 路由", 1)[-1]
    out, cur = [], None
    for line in block.splitlines():
        m = re.match(r"^- \*\*(.+?)\*\*(.*)$", line.strip())
        if m:
            if cur:
                out.append(cur)
            cur = {"feature": m.group(1).strip(), "skill": "", "confirm": ""}
            continue
        if cur is None:
            continue
        m = re.match(r"^→\s*(.+)$", line.strip())
        if m and not cur["skill"]:
            raw = m.group(1)
            quoted = re.search(r"`([^`]+)`", raw)
            cur["skill"] = quoted.group(1) if quoted else raw.split("：")[0].split("（")[0].strip()
        m = re.search(r"确认：(\d{4}-\d{2}-\d{2})", line.strip())
        if m:
            cur["confirm"] = m.group(1)
    if cur:
        out.append(cur)
    return out


def render_path(path):
    parts = []
    for i, node in enumerate(path):
        name = node.get("name") if isinstance(node, dict) else str(node)
        kind = node.get("kind", "skill") if isinstance(node, dict) else "skill"
        if i:
            parts.append('<span class="arrow">→</span>')
        parts.append(
            f'<span class="node {esc(kind)}" title="{esc(KIND_LABEL.get(kind, kind))}">{esc(name)}</span>'
        )
    return "".join(parts)


def entry_html(index, rec):
    label, tone = DECISIONS.get(rec.get("decision", "new"), ("未标注", "new"))
    loads = rec.get("loads")
    if loads is None:
        loads = sum(1 for n in rec.get("path", []) if isinstance(n, dict) and n.get("kind") != "inline")
    load_text = f"加载 {loads} 个 skill" if loads else "0 次加载 · 技能已在上下文"
    chips = "".join(f'<span class="chip">{esc(c)}</span>' for c in rec.get("decompose", []))
    arts = "".join(f'<span class="art">{esc(a)}</span>' for a in rec.get("artifacts", []))
    note = f'<p class="note">{esc(rec["note"])}</p>' if rec.get("note") else ""
    stamp = esc(rec.get("ts", ""))
    clock = stamp[11:16] if len(stamp) >= 16 and "T" in stamp else stamp
    return f"""<article class="entry">
  <span class="dot">{index}</span>
  <div class="card">
    <div class="row">
      <span class="idx">#{index}</span>
      <time>{clock}</time>
      <span class="badge {tone}">{esc(label)}</span>
      <span class="loads">{load_text}</span>
    </div>
    <p class="ask">{esc(rec.get("request", ""))}</p>
    {f'<div class="chips">{chips}</div>' if chips else ''}
    <div class="path">{render_path(rec.get("path", []))}</div>
    {f'<div class="out"><span class="outlabel">产物</span>{arts}</div>' if arts else ''}
    {note}
  </div>
</article>"""


TEMPLATE = Template("""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>技能执行日志 · dsh-skill-router</title>
<style>
:root{--ink:#111827;--ink2:#4B5563;--ink3:#9CA3AF;--line:#E5E7EB;--bg:#F4F5F7;--card:#fff;--accent:#1E3A5F;
--hit:#047857;--hitbg:#D1FAE5;--first:#B45309;--firstbg:#FEF3C7;--newc:#1D4ED8;--newbg:#DBEAFE;--nonec:#B91C1C;--nonebg:#FEE2E2}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif;
-webkit-font-smoothing:antialiased}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wrap{max-width:1060px;margin:0 auto;padding:54px 28px 90px}
h1{margin:0 0 6px;font-size:29px;letter-spacing:-.02em}
.sub{color:var(--ink2);font-size:14px;margin:0}
.meta{margin-top:12px;color:var(--ink3);font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.stat b{display:block;font-size:26px;line-height:1.15;letter-spacing:-.02em}
.stat span{font-size:12px;color:var(--ink2)}
.hint{margin:10px 0 0;color:var(--ink3);font-size:12px}
h2{font-size:15px;margin:40px 0 14px;letter-spacing:.01em}
h2 small{font-weight:400;color:var(--ink3);margin-left:8px;font-size:12.5px}
.entry{position:relative;padding-left:36px;margin-bottom:18px}
.entry:not(:last-child):before{content:"";position:absolute;left:15px;top:26px;bottom:-18px;width:2px;background:#E5E7EB}
.dot{position:absolute;left:4px;top:8px;width:22px;height:22px;border-radius:50%;background:var(--card);
border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px 18px;
box-shadow:0 1px 2px rgba(16,24,40,.04)}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.idx{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink3)}
.row time{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink3)}
.loads{margin-left:auto;font-size:12px;color:var(--ink3)}
.badge{font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;border:1px solid transparent}
.badge.hit{color:var(--hit);background:var(--hitbg);border-color:#A7F3D0}
.badge.first{color:var(--first);background:var(--firstbg);border-color:#FDE68A}
.badge.new{color:var(--newc);background:var(--newbg);border-color:#BFDBFE}
.badge.none{color:var(--nonec);background:var(--nonebg);border-color:#FECACA}
.ask{margin:12px 0 12px;padding:1px 0 1px 12px;border-left:3px solid #CBD5E1;color:#374151;font-size:14px}
.chips{margin:0 0 12px}
.chip{display:inline-block;background:#F3F4F6;border:1px solid #E9EBEF;color:#4B5563;border-radius:999px;
padding:2px 9px;font-size:11.5px;margin:0 6px 6px 0}
.path{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:12px 14px;background:#FAFBFC;
border:1px solid #EDEFF2;border-radius:10px}
.node{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;padding:3px 9px;border-radius:7px;
border:1px solid #CBD5E1;background:#fff;color:#1F2937}
.node.jump{border-style:dashed;border-color:#F59E0B;background:#FFFBEB;color:#92400E}
.node.inline{border-color:#E5E7EB;background:#F3F4F6;color:#6B7280}
.node.tool{border-color:#BAE6FD;background:#F0F9FF;color:#0369A1}
.arrow{color:#9CA3AF;font-size:12px}
.out{margin-top:12px;font-size:12.5px;color:var(--ink2)}
.outlabel{color:var(--ink3);margin-right:8px}
.art{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#1E3A5F;
background:#EEF2F7;border:1px solid #DCE3EC;border-radius:6px;padding:1px 7px;margin:0 6px 4px 0}
.note{margin:12px 0 0;font-size:12.5px;color:#6B7280;padding-top:10px;border-top:1px dashed #E5E7EB}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
border-radius:12px;overflow:hidden;font-size:13px}
th{text-align:left;background:#F9FAFB;color:var(--ink2);font-weight:600;font-size:12px;
padding:9px 14px;border-bottom:1px solid var(--line)}
td{padding:10px 14px;border-bottom:1px solid #F1F2F4;vertical-align:top}
tr:last-child td{border-bottom:none}
td.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#1E3A5F}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:34px;padding-top:18px;border-top:1px solid var(--line);
font-size:12px;color:var(--ink2)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}
footer{margin-top:34px;color:var(--ink3);font-size:12px}
footer code{font-family:ui-monospace,Menlo,monospace;background:#EDEFF2;padding:1px 6px;border-radius:5px}
@media (max-width:680px){.stats{grid-template-columns:repeat(2,1fr)}.wrap{padding:32px 16px 60px}}
@media print{body{background:#fff}.card,table,.stat{box-shadow:none}}
</style>
</head>
<body>
<div class="wrap">
  <h1>技能执行日志</h1>
  <p class="sub">每次请求是怎么被路由的：拆解 → 决策 → 沿用的 skill 路径 → 产物。</p>
  <p class="meta mono">更新于 $updated · 数据源 ~/.dsh/skill-router/log.jsonl</p>

  <div class="stats">$cards</div>
  <p class="hint">$hint</p>

  <h2>时间线 <small>按发生顺序</small></h2>
  $timeline

  <h2>路由表现状 <small>真源 routes.md，命中即免确认</small></h2>
  $routes

  <div class="legend">
    <span><i style="background:#D1FAE5;border:1px solid #A7F3D0"></i>命中路由表</span>
    <span><i style="background:#FEF3C7;border:1px solid #FDE68A"></i>首次确认</span>
    <span><i style="background:#DBEAFE;border:1px solid #BFDBFE"></i>无表可命中</span>
    <span><i style="background:#FEE2E2;border:1px solid #FECACA"></i>0 匹配</span>
    <span class="mono">虚线框 = 跳板 skill；灰色 = 已在上下文、未重复加载</span>
  </div>

  <footer>由 <code>dsh-skill-router</code> 记录 · 重跑渲染：<code>python3 ~/.dsh/skill-router/log.py render --out 文件.html</code></footer>
</div>
</body>
</html>
""")


def build_html(out_path):
    records = load()
    if not records:
        print("日志为空，先 add 一条再渲染", file=sys.stderr)
        return 1
    loads = sum(
        (r.get("loads") if r.get("loads") is not None else
         sum(1 for n in r.get("path", []) if isinstance(n, dict) and n.get("kind") != "inline"))
        for r in records
    )
    hits = sum(1 for r in records if r.get("decision") == "hit")
    firsts = sum(1 for r in records if r.get("decision") == "first-confirm")
    cards = "".join(
        f'<div class="stat"><b>{value}</b><span>{label}</span></div>'
        for value, label in [
            (len(records), "次请求"),
            (loads, "次 skill 加载"),
            (hits, "次路由表命中"),
            (firsts, "次首次确认"),
        ]
    )
    hint = f"{len(records)} 次请求合计只加载了 {loads} 个 skill；命中的请求 0 次重复加载、0 次追问。"
    timeline = "\n".join(entry_html(i + 1, r) for i, r in enumerate(records))

    routes = parse_routes()
    if routes:
        rows = "".join(
            f'<tr><td>{esc(r["feature"])}</td><td class="mono">{esc(r["skill"] or "—")}</td>'
            f'<td class="mono">{esc(r["confirm"] or "—")}</td></tr>'
            for r in routes
        )
        routes_html = (
            "<table><thead><tr><th>需求特征</th><th>路由到</th><th>确认日</th></tr></thead>"
            f"<tbody>{rows}</tbody></table>"
        )
    else:
        routes_html = '<p class="hint">路由表还没有条目。</p>'

    stamp = datetime.datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
    html_text = TEMPLATE.substitute(
        updated=stamp, cards=cards, hint=hint, timeline=timeline, routes=routes_html
    )
    Path(out_path).write_text(html_text, encoding="utf-8")
    print(f"rendered -> {out_path} ({len(records)} 条记录, {loads} 次加载)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("add")
    rp = sub.add_parser("render")
    rp.add_argument("--out", required=True)
    args = ap.parse_args()

    if args.cmd == "add":
        raw = sys.stdin.read().strip()
        if not raw:
            print("stdin 为空：需要一行 JSON", file=sys.stderr)
            return 1
        try:
            rec = json.loads(raw)
        except Exception as exc:
            print(f"JSON 解析失败: {exc}", file=sys.stderr)
            return 1
        rec.setdefault("ts", datetime.datetime.now().astimezone().isoformat(timespec="minutes"))
        for key in ("request", "decision", "path"):
            if key not in rec:
                print(f"缺字段: {key}", file=sys.stderr)
                return 1
        if not isinstance(rec["path"], list):
            print("path 必须是数组", file=sys.stderr)
            return 1
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print(f"appended -> {LOG}")
        return 0

    return build_html(args.out)


if __name__ == "__main__":
    sys.exit(main())

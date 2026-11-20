#!/usr/bin/env bash
# 给仓库打上 dsh-plugin 生态的 topic。需要一次授权：
#   gh auth login                     （走 gh，需 repo 权限）
# 或  export GITHUB_TOKEN=<带 repo 权限的 PAT>
# 用法：./scripts/set-topics.sh [owner/repo]
set -euo pipefail

REPO="${1:-renzg/dsh-skill-router}"
TOPICS='"dsh-plugin","dsh","deepseek-harness","cordis-plugin"'

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "→ 用 gh 打 topic: $REPO"
  gh repo edit "$REPO" \
    --add-topic dsh-plugin \
    --add-topic dsh \
    --add-topic deepseek-harness \
    --add-topic cordis-plugin
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "→ 用 API 打 topic: $REPO"
  curl -sS -X PUT \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/topics" \
    -d "{\"names\":[$TOPICS]}" >/dev/null
else
  echo "✗ 没有可用凭据：先 gh auth login，或 export GITHUB_TOKEN=<PAT>" >&2
  echo "  也可以直接在网页改：仓库首页 → About 齿轮 → Topics" >&2
  exit 1
fi

echo "→ 回读校验"
curl -sS -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/topics" | tr -d '\n' | sed 's/  */ /g'
echo
echo "→ topics 页面（收录有几分钟延迟）: https://github.com/topics/dsh-plugin"

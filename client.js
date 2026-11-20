window.__ModuleLoader__.load({
  id: 'dsh-skill-router',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
    const EMPTY = Object.freeze({ eventNodes: [], runningCalls: [] })
    const C = {
      base: 'var(--dsw-alias-bg-base)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      border1: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      primary: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }
    const STATE_TEXT = { ok: '已完成', running: '执行中', pending: '无结果', error: '报错' }

    /** Join the readable text of one content-block list, tolerating unknown shapes. */
    function textOf(blocks) {
      if (!Array.isArray(blocks)) return ''
      const parts = []
      for (const block of blocks) {
        if (!block) continue
        if (typeof block === 'string') { parts.push(block); continue }
        if (typeof block.text === 'string') parts.push(block.text)
        else if (block.kind === 'image' || block.type === 'image') parts.push('[图片]')
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim()
    }

    /** Read the skill name out of a `skill` tool call's raw arguments. */
    function skillOf(argsRaw) {
      if (typeof argsRaw !== 'string' || argsRaw.length === 0) return null
      try {
        const parsed = JSON.parse(argsRaw)
        if (parsed && typeof parsed.name === 'string' && parsed.name.length > 0) return parsed.name
      } catch (error) {
        /* arguments may still be streaming */
      }
      const match = /"name"\s*:\s*"([^"\\]+)"/.exec(argsRaw)
      return match ? match[1] : null
    }

    /**
     * Fold one Trajectory snapshot into per-request groups of loaded skills.
     * Status precedence: a tool result settles ok/error; a call still listed in
     * runningCalls upgrades an unsettled call to running; anything else stays pending.
     */
    function collect(snapshot) {
      const nodes = snapshot && Array.isArray(snapshot.eventNodes) ? snapshot.eventNodes : []
      const running = snapshot && Array.isArray(snapshot.runningCalls) ? snapshot.runningCalls : []
      const settled = new Map()
      for (const node of nodes) {
        if (node && node.kind === 'tool-result' && typeof node.callId === 'string') {
          settled.set(node.callId, node.isError ? 'error' : 'ok')
        }
      }

      const groups = []
      let current = null
      const open = (time, request) => {
        current = {
          id: groups.length + 1,
          time: typeof time === 'number' ? time : 0,
          request: typeof request === 'string' ? request : '',
          skills: [],
        }
        groups.push(current)
        return current
      }
      const add = (group, skill, callId, state) => {
        const existing = callId ? group.skills.find((entry) => entry.callId === callId) : undefined
        if (existing) {
          if (state === 'running' && existing.status === 'pending') existing.status = 'running'
          return
        }
        group.skills.push({ skill, callId: callId || skill + ':' + group.skills.length, status: state })
      }

      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        if (node.kind === 'user') {
          const text = textOf(node.content)
          open(node.time, text || '（这一轮没有可读的请求文本）')
          continue
        }
        if (node.kind !== 'assistant' || !Array.isArray(node.blocks)) continue
        for (const block of node.blocks) {
          if (!block || block.kind !== 'tool-call' || block.name !== 'skill') continue
          const skill = skillOf(block.argsRaw)
          if (!skill) continue
          const group = current || open(node.time, '')
          add(group, skill, block.callId, settled.get(block.callId) || 'pending')
        }
      }
      for (const item of running) {
        if (!item || item.name !== 'skill') continue
        const skill = skillOf(item.argsRaw)
        if (!skill) continue
        const group = current || open(item.time, '')
        add(group, skill, item.callId, 'running')
      }

      // Reuse means "this skill was already loaded by an earlier request".
      const earlier = new Set()
      for (const group of groups) {
        for (const entry of group.skills) entry.reuse = earlier.has(entry.skill)
        for (const entry of group.skills) earlier.add(entry.skill)
      }
      return groups
    }

    const RATINGS_KEY = 'skill-router.ratings.v1'

    /** Skills whose home repository is known, so a 👍 can point the user at GitHub. */
    const SKILL_REPOS = {
      'dsh-skill-router': 'renzg/dsh-skill-router',
      office: 'dream-num/dsh-univer-office',
      'office-docx': 'dream-num/dsh-univer-office',
      'office-pptx': 'dream-num/dsh-univer-office',
      'office-xlsx': 'dream-num/dsh-univer-office',
      univer: 'dream-num/dsh-univer-office',
      'univer-base': 'dream-num/dsh-univer-office',
      'univer-board': 'dream-num/dsh-univer-office',
      'univer-cross-unit-formula': 'dream-num/dsh-univer-office',
      'univer-doc': 'dream-num/dsh-univer-office',
      'univer-embed': 'dream-num/dsh-univer-office',
      'univer-sheet': 'dream-num/dsh-univer-office',
      'univer-slide': 'dream-num/dsh-univer-office',
    }

    /** Ratings are per browser profile, so they accumulate across every session. */
    function readRatings() {
      try {
        const raw = window.localStorage.getItem(RATINGS_KEY)
        const parsed = raw === null ? null : JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch (error) {
        return {}
      }
    }

    function persistRatings(all) {
      try {
        window.localStorage.setItem(RATINGS_KEY, JSON.stringify(all))
      } catch (error) {
        /* private mode or quota: the vote still renders for this session */
      }
    }

    /** One vote per skill: clicking the same side again withdraws it. */
    function applyVote(all, skill, kind) {
      const current = all[skill] || { up: 0, down: 0, mine: null }
      let up = current.up || 0
      let down = current.down || 0
      let mine = current.mine || null
      if (mine === kind) {
        if (kind === 'up') up = Math.max(0, up - 1)
        else down = Math.max(0, down - 1)
        mine = null
      } else {
        if (mine === 'up') up = Math.max(0, up - 1)
        if (mine === 'down') down = Math.max(0, down - 1)
        if (kind === 'up') up += 1
        else down += 1
        mine = kind
      }
      const next = Object.assign({}, all)
      next[skill] = { up, down, mine }
      return next
    }

    /** Most-used skills of this session, most used first. */
    function topSkills(groups, limit) {
      const counts = new Map()
      for (const group of groups) {
        for (const entry of group.skills) counts.set(entry.skill, (counts.get(entry.skill) || 0) + 1)
      }
      return [...counts.entries()]
        .map(([skill, count]) => ({ skill, count }))
        .sort((left, right) => right.count - left.count || left.skill.localeCompare(right.skill))
        .slice(0, typeof limit === 'number' ? limit : 5)
    }

    /** Markers the routing skill leaves in a reply when a better skill exists but is not installed. */
    const SUGGEST_RE = /<!--\s*skill-router:suggest\s*(\{[\s\S]*?\})\s*-->/g

    function collectSuggestions(snapshot) {
      const nodes = snapshot && Array.isArray(snapshot.eventNodes) ? snapshot.eventNodes : []
      const out = []
      const seen = new Set()
      for (const node of nodes) {
        if (!node || node.kind !== 'assistant' || !Array.isArray(node.blocks)) continue
        for (const block of node.blocks) {
          if (!block || block.kind !== 'text' || typeof block.text !== 'string') continue
          SUGGEST_RE.lastIndex = 0
          let match
          while ((match = SUGGEST_RE.exec(block.text)) !== null) {
            try {
              const value = JSON.parse(match[1])
              if (!value || typeof value.skill !== 'string' || value.skill.length === 0) continue
              if (seen.has(value.skill)) continue
              seen.add(value.skill)
              out.push({
                skill: value.skill,
                bundle: typeof value.bundle === 'string' ? value.bundle : '',
                desc: typeof value.desc === 'string' ? value.desc : '',
                why: typeof value.why === 'string' ? value.why : '',
              })
            } catch (error) {
              /* a malformed marker must never break the panel */
            }
          }
        }
      }
      return out
    }

    function installCommand(bundle) {
      return bundle ? 'dsh plugin --profile desktop add ' + bundle : ''
    }

    function clockOf(time) {
      if (typeof time !== 'number' || time <= 0) return '--:--'
      const date = new Date(time)
      const pad = (value) => (value < 10 ? '0' + value : String(value))
      return pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    const dotColor = (state) => state === 'error'
      ? C.error
      : state === 'running'
        ? C.warn
        : state === 'pending'
          ? C.idle
          : C.success

    const chip = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      maxWidth: '100%',
      minWidth: 0,
      padding: '3px 8px',
      borderRadius: 6,
      border: '1px solid ' + C.border1,
      background: C.layer2,
      color: C.primary,
      fontFamily: MONO,
      fontSize: 11.5,
      lineHeight: 1.5,
    }

    function SkillChip(props) {
      const entry = props.entry
      const tone = entry.status === 'error' ? { borderColor: C.error, color: C.error } : null
      const dashed = entry.status === 'running' || entry.status === 'pending' ? { borderStyle: 'dashed' } : null
      return h('span', {
        style: Object.assign({}, chip, tone, dashed),
        title: entry.skill + ' · ' + (STATE_TEXT[entry.status] || entry.status) + (entry.reuse ? ' · 更早轮次已加载' : ''),
      },
        h('span', { 'aria-hidden': true, style: { width: 5, height: 5, borderRadius: '50%', background: dotColor(entry.status), flex: '0 0 auto' } }),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.skill),
        entry.reuse ? h('span', { style: { color: C.secondary, fontSize: 11 } }, '复用') : null,
        h('span', { style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } },
          STATE_TEXT[entry.status] || entry.status),
      )
    }

    function TurnCard(props) {
      const group = props.group
      const path = []
      for (const entry of group.skills) {
        if (path.length > 0) path.push(h('span', { key: 'arrow-' + entry.callId, style: { color: C.secondary, fontSize: 11 } }, '→'))
        path.push(h(SkillChip, { key: entry.callId, entry }))
      }
      return h('div', {
        style: {
          border: '1px solid ' + C.border1,
          borderRadius: 10,
          background: C.layer1,
          padding: '10px 12px',
          marginBottom: 8,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('span', { style: { color: C.secondary, fontFamily: MONO, fontSize: 11.5, flex: '0 0 auto' } }, '#' + group.id),
          h('span', { style: { color: C.secondary, fontFamily: MONO, fontSize: 11.5, flex: '0 0 auto' } }, clockOf(group.time)),
          path.length > 0
            ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, flex: '1 1 auto' } }, path)
            : null,
          h('span', { style: { marginLeft: 'auto', color: C.secondary, fontSize: 11.5, flex: '0 0 auto' } },
            group.skills.length > 0 ? group.skills.length + ' 个 skill' : '未加载'),
        ),
        h('div', {
          title: group.request,
          style: {
            color: C.secondary,
            fontSize: 12,
            lineHeight: 1.55,
            marginTop: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }, group.request),
      )
    }

    const VOTE_STYLE = [
      '.sr-vote{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:1.5;cursor:pointer}',
      '.sr-vote:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.sr-vote:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.sr-up[aria-pressed="true"]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.sr-down[aria-pressed="true"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.sr-star{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:transparent;font:inherit;font-size:11.5px;line-height:1.5;text-decoration:none;white-space:nowrap}',
      '.sr-star:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.sr-copy{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;line-height:1.5;cursor:pointer;white-space:nowrap}',
      '.sr-copy:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.sr-cmd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    ].join('\n')

    function TopSkills(props) {
      const rows = props.rows
      const ratings = props.ratings
      const vote = props.vote
      if (rows.length === 0) return null
      const items = rows.map((row, index) => {
        const rating = ratings[row.skill] || { up: 0, down: 0, mine: null }
        const repo = SKILL_REPOS[row.skill]
        return h('div', {
          key: row.skill,
          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' },
        },
          h('span', { style: { color: C.secondary, fontFamily: MONO, fontSize: 11, width: 14, flex: '0 0 auto' } }, String(index + 1)),
          h('span', {
            title: row.skill,
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              fontFamily: MONO,
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }, row.skill),
          h('span', { style: { color: C.secondary, fontFamily: MONO, fontSize: 11.5, flex: '0 0 auto' } }, row.count + ' 次'),
          h('button', {
            type: 'button',
            className: 'sr-vote sr-up',
            'aria-pressed': rating.mine === 'up' ? 'true' : 'false',
            'aria-label': '标记 ' + row.skill + ' 好用，当前 ' + rating.up + ' 票',
            title: '好用',
            onClick: () => vote(row.skill, 'up'),
          }, '👍 ', String(rating.up)),
          h('button', {
            type: 'button',
            className: 'sr-vote sr-down',
            'aria-pressed': rating.mine === 'down' ? 'true' : 'false',
            'aria-label': '标记 ' + row.skill + ' 不好用，当前 ' + rating.down + ' 票',
            title: '不好用',
            onClick: () => vote(row.skill, 'down'),
          }, '👎 ', String(rating.down)),
          repo !== undefined && rating.mine === 'up'
            ? h('a', {
              href: 'https://github.com/' + repo,
              target: '_blank',
              rel: 'noreferrer noopener',
              className: 'sr-star',
              title: '在 GitHub 给 ' + repo + ' 加星',
            }, '⭐ Star')
            : null,
        )
      })
      return h('div', {
        style: {
          border: '1px solid ' + C.border1,
          borderRadius: 10,
          background: C.layer1,
          padding: '10px 12px',
          marginBottom: 12,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 } },
          h('div', { style: { fontSize: 12.5, fontWeight: 600 } }, '本轮最常用'),
          h('div', { style: { color: C.secondary, fontSize: 11.5 } }, '评分跨会话累计'),
        ),
        items,
      )
    }

    function Suggestions(props) {
      const rows = props.rows
      const [copied, setCopied] = React.useState('')
      if (rows.length === 0) return null
      const copy = (skill, command) => {
        try {
          const pending = navigator.clipboard.writeText(command)
          if (pending && typeof pending.then === 'function') {
            pending.then(() => setCopied(skill)).catch(() => setCopied(''))
          } else {
            setCopied(skill)
          }
        } catch (error) {
          setCopied('')
        }
      }
      const items = rows.map((row) => {
        const command = installCommand(row.bundle)
        return h('div', { key: row.skill, style: { padding: '4px 0' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', {
              title: row.skill,
              style: { flex: '1 1 auto', minWidth: 0, fontFamily: MONO, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }, row.skill),
            command.length > 0
              ? h('button', {
                type: 'button',
                className: 'sr-copy',
                title: command,
                onClick: () => copy(row.skill, command),
              }, copied === row.skill ? '已复制' : '复制安装命令')
              : h('span', { className: 'sr-cmd' }, '需在插件市场安装'),
          ),
          row.desc.length > 0
            ? h('div', {
              title: row.desc,
              style: { color: C.primary, fontSize: 12, lineHeight: 1.5, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
            }, row.desc)
            : null,
          row.why.length > 0
            ? h('div', {
              title: row.why,
              style: { color: C.secondary, fontSize: 11.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }, row.why)
            : null,
          command.length > 0
            ? h('div', { className: 'sr-cmd', style: { marginTop: 2 }, title: command }, command)
            : null,
        )
      })
      return h('div', {
        style: { border: '1px dashed ' + C.brand, borderRadius: 10, background: C.layer1, padding: '10px 12px', marginBottom: 12 },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 } },
          h('div', { style: { fontSize: 12.5, fontWeight: 600 } }, '建议安装'),
          h('div', { style: { color: C.secondary, fontSize: 11.5 } }, '本轮匹配到、但本地没有的技能 · 简介取自官方'),
        ),
        items,
      )
    }

    function SkillRouterView(props) {
      const store = props.store
      const subscribe = React.useCallback((listener) => (store ? store.subscribe(listener) : () => {}), [store])
      const getSnapshot = React.useCallback(() => (store ? store.getSnapshot() : EMPTY), [store])
      const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      const [slow, setSlow] = React.useState(false)

      const ready = store ? store.isReady() : false
      React.useEffect(() => {
        if (ready) { setSlow(false); return undefined }
        const timer = setTimeout(() => setSlow(true), 3000)
        return () => clearTimeout(timer)
      }, [ready])

      const groups = React.useMemo(() => {
        try {
          return collect(snapshot)
        } catch (error) {
          return []
        }
      }, [snapshot])

      let loads = 0
      const distinct = new Set()
      for (const group of groups) {
        for (const entry of group.skills) {
          loads += 1
          distinct.add(entry.skill)
        }
      }

      const [ratings, setRatings] = React.useState(() => readRatings())
      React.useEffect(() => {
        persistRatings(ratings)
      }, [ratings])
      const vote = React.useCallback((skill, kind) => {
        setRatings((all) => applyVote(all, skill, kind))
      }, [])
      const top = React.useMemo(() => topSkills(groups, 5), [groups])
      const suggestions = React.useMemo(() => {
        const used = new Set()
        for (const group of groups) for (const entry of group.skills) used.add(entry.skill)
        try {
          return collectSuggestions(snapshot).filter((row) => used.has(row.skill) === false)
        } catch (error) {
          return []
        }
      }, [snapshot, groups])

      const rows = groups.map((group) => h(TurnCard, { key: 'group-' + group.id, group }))

      let body
      if (!ready) {
        body = h('div', { style: { color: C.secondary, fontSize: 12.5, lineHeight: 1.7, padding: '10px 2px' } },
          slow
            ? '读不到这个会话的轨迹数据。轨迹视图可能没有启用，或该会话尚未绑定。'
            : '正在读取会话轨迹…',
        )
      } else if (groups.length === 0) {
        body = h('div', { style: { color: C.secondary, fontSize: 12.5, lineHeight: 1.7, padding: '10px 2px' } },
          h('div', { style: { color: C.primary, fontSize: 13, fontWeight: 600, marginBottom: 6 } }, '还没有 skill 路径'),
          '发出一个任务后，这里会按轮次记录实际加载的 skill 顺序：加载了什么、是否复用、哪一次失败。',
        )
      } else {
        body = rows
      }

      return h('div', {
        role: 'region',
        'aria-label': '技能：按轮次记录 skill 加载顺序',
        tabIndex: 0,
        style: {
          height: '100%',
          overflowY: 'auto',
          padding: '14px 16px 24px',
          background: C.base,
          color: C.primary,
          fontSize: 13,
          outline: 'none',
        },
      },
        h('style', { key: 'skill-router-vote-style' }, VOTE_STYLE),
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' } },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '技能'),
          groups.length > 0
            ? h('div', { style: { color: C.secondary, fontSize: 11.5 } },
              groups.length + ' 轮 · ' + loads + ' 次加载 · ' + distinct.size + ' 个不同 skill')
            : null,
        ),
        h('div', { style: { color: C.secondary, fontSize: 11.5, lineHeight: 1.7, marginBottom: 12 } },
          '按加载顺序排列；「复用」＝ 更早的请求已加载过；虚线 ＝ 尚未结束；红点 ＝ 该次调用报错。'),
        top.length > 0 ? h(TopSkills, { rows: top, ratings, vote }) : null,
        h(Suggestions, { rows: suggestions }),
        body,
      )
    }

    /** Subscribe lazily: the Session binding may not exist when the tab is injected. */
    function createStore(ctx, sessionId) {
      let binding = null
      let target = null
      const resolve = () => {
        if (target !== null) return target
        try {
          const next = ctx.sessions.binding(sessionId)
          if (!next) return null
          binding = next
          target = ctx.uiConversation.binding(next).target('trajectory')
          return target
        } catch (error) {
          return null
        }
      }
      return {
        isReady: () => target !== null,
        getSnapshot() {
          const current = resolve()
          if (current === null) return EMPTY
          try {
            return current.getSnapshot() || EMPTY
          } catch (error) {
            return EMPTY
          }
        },
        subscribe(listener) {
          let disposed = false
          let timer = null
          let inner = null
          const attach = () => {
            if (disposed) return
            const current = resolve()
            if (current === null) {
              timer = setTimeout(attach, 800)
              return
            }
            try {
              const dispose = current.subscribe(listener)
              inner = typeof dispose === 'function' ? dispose : null
              if (!disposed) listener()
            } catch (error) {
              timer = setTimeout(attach, 1500)
            }
          }
          attach()
          return () => {
            disposed = true
            if (timer !== null) clearTimeout(timer)
            if (inner !== null) {
              try {
                inner()
              } catch (error) {
                /* disposal is best-effort */
              }
            }
          }
        },
      }
    }

    return {
      inject: ['slots', 'sessions', 'uiConversation'],
      apply(ctx) {
        const stores = new Map()
        const storeFor = (sessionId) => {
          let store = stores.get(sessionId)
          if (store === undefined) {
            store = createStore(ctx, sessionId)
            stores.set(sessionId, store)
          }
          return store
        }
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'skill-router',
          order: 25,
          label: () => '技能',
          inject: (sessionId) => ({ store: storeFor(sessionId) }),
        }, SkillRouterView))
      },
      __internals: { collect, skillOf, textOf, topSkills, applyVote, readRatings, collectSuggestions, installCommand },
    }
  },
})

// Render smoke test: the view must produce a tree instead of throwing,
// because a throwing slot entry blanks the whole tab.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
let factory = null
globalThis.window = {
  __ModuleLoader__: { load: (definition) => { factory = definition.factory } },
  // The panel reads ratings at mount; seed one 👍 so the star link can be asserted.
  localStorage: {
    getItem: () => JSON.stringify({ 'dsh-skill-router': { up: 1, down: 0, mine: 'up' } }),
    setItem: () => {},
  },
}
new Function(readFileSync(join(here, '..', 'client.js'), 'utf8'))()

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}
const mod = factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error('unexpected require: ' + name)
})
// Capture the view the way the runtime does: through apply()'s slot registration.
let SkillRouterView = null
mod.apply({
  slots: { inject: (_key, callback) => callback(), register: (_options, component) => { SkillRouterView = component; return () => {} } },
  sessions: {},
  uiConversation: {},
})
const { collect } = mod.__internals
if (typeof SkillRouterView !== 'function') throw new Error('apply() did not register a view component')

const at = (s) => Date.parse(s)
const snapshot = {
  eventNodes: [
    { kind: 'user', seq: 1, time: at('2026-11-20T20:28:00+08:00'), content: [{ type: 'text', text: '跑一遍试试' }] },
    {
      kind: 'assistant', seq: 2, turn: 1, step: 1, time: at('2026-11-20T20:29:00+08:00'),
      blocks: [
        { kind: 'tool-call', callId: 'c1', name: 'skill', argsRaw: '{"name":"dsh-skill-router"}' },
        { kind: 'tool-call', callId: 'c2', name: 'skill', argsRaw: '{"name":"office-xlsx"}' },
        { kind: 'tool-call', callId: 'c3', name: 'skill', argsRaw: '{"name":"office-xlsx"}' },
        { kind: 'tool-call', callId: 'c4', name: 'skill', argsRaw: '{"name":"univer"}' },
        { kind: 'text', text: '收尾。<!-- skill-router:suggest {"skill":"dsh-skill-badge","desc":"给文档/PR 等产出物自动加上 powered-by DSH 标记","bundle":"@deepseek-ai/dsh-experimental-badge-skill-bundle","why":"本地未安装，能自动加 powered-by 标记"} -->' },
      ],
    },
  ],
  runningCalls: [],
}
const store = { isReady: () => true, getSnapshot: () => snapshot, subscribe: () => () => {} }

const tree = SkillRouterView({ store })
const flat = []
const walk = (node) => {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) { node.forEach(walk); return }
  if (typeof node !== 'object') return
  // Function components are invoked the way React would render them.
  if (typeof node.type === 'function') { walk(node.type(node.props)); return }
  flat.push(node)
  walk(node.children)
}
walk(tree)

const texts = flat.filter((n) => typeof n.children?.[0] === 'string').map((n) => n.children[0])
assert.ok(texts.includes('本轮最常用'), 'top block renders')

const buttons = flat.filter((n) => n.type === 'button' && String(n.props?.className || '').startsWith('sr-vote'))
assert.equal(buttons.length, 6, 'three distinct skills x two vote buttons')
const pressed = buttons.filter((b) => b.props['aria-pressed'] === 'true')
assert.equal(pressed.length, 1, 'the seeded vote shows as pressed')
assert.equal(pressed[0].props['aria-label'], '标记 dsh-skill-router 好用，当前 1 票')
assert.ok(buttons.some((b) => b.props['aria-label'] === '标记 office-xlsx 好用，当前 0 票'))
assert.ok(flat.some((n) => n.type === 'style'), 'component styles are rendered as an element')

// --- layout: the skill path lives on the title row ---------------------
const textsAll = []
const collectText = (node) => {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string') { textsAll.push(node); return }
  if (Array.isArray(node)) { node.forEach(collectText); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') { collectText(node.type(node.props)); return }
  collectText(node.children)
}
collectText(tree)
assert.ok(!textsAll.includes('这一轮没有调用 skill'), 'the removed sentence must not come back')

const cards = flat.filter((n) => n.props?.style?.borderRadius === 10 && n.props?.style?.marginBottom === 8)
assert.equal(cards.length, 1, 'one turn card')
assert.equal(cards[0].children.length, 2, 'card is exactly header + request now')
assert.equal(cards[0].children[1].children[0], '跑一遍试试', 'request stays on its own line')
const chips = flat.filter((n) => typeof n.props?.title === 'string' && n.props.title.includes(' · '))
assert.equal(chips.length, 4, 'all four skill chips sit in the header row (office-xlsx appears twice)')

// --- 👍 on a skill with a known repo exposes the GitHub star link ------
const stars = flat.filter((n) => n.type === 'a' && n.props?.className === 'sr-star')
assert.equal(stars.length, 1, 'only the up-voted skill with a known repo gets a star link')
assert.equal(stars[0].props.href, 'https://github.com/renzg/dsh-skill-router')
assert.equal(stars[0].props.target, '_blank')
assert.ok(stars[0].props.rel.includes('noreferrer'), 'external link is isolated')

// --- 未安装技能的「复制安装命令」入口 --------------------------------
const copyButtons = flat.filter((n) => n.type === 'button' && n.props?.className === 'sr-copy')
assert.equal(copyButtons.length, 1, 'one suggestion row for the not-installed skill')
assert.equal(copyButtons[0].props.title, 'dsh plugin --profile desktop add @deepseek-ai/dsh-experimental-badge-skill-bundle')
const suggestTexts = textsAll.filter((t) => typeof t === 'string')
assert.ok(suggestTexts.includes('建议安装'), 'suggestion block is visible')
assert.ok(suggestTexts.includes('dsh-skill-badge'), 'the suggested skill is named')
assert.ok(suggestTexts.includes('给文档/PR 等产出物自动加上 powered-by DSH 标记'), 'the official blurb is shown so the skill is recognisable')
assert.ok(suggestTexts.includes('本地未安装，能自动加 powered-by 标记'), 'the request-specific reason stays separate')
// 标记缺 desc 时不能崩，也不能显示空行
const noDesc = mod.__internals.collectSuggestions({ eventNodes: [{ kind: 'assistant', blocks: [{ kind: 'text', text: '<!-- skill-router:suggest {"skill":"x","bundle":"y"} -->' }] }] })
assert.equal(noDesc.length, 1)
assert.equal(noDesc[0].desc, '')

// 已使用的技能不应再出现在建议里
const { collectSuggestions } = mod.__internals
assert.equal(collectSuggestions(snapshot).length, 1)
const parsed = collectSuggestions({ eventNodes: [{ kind: 'assistant', blocks: [{ kind: 'text', text: '<!-- skill-router:suggest {broken} -->' }] }] })
assert.deepEqual(parsed, [], 'malformed marker is ignored, never throws')

// Empty session must not render the top block.
const empty = SkillRouterView({ store: { isReady: () => true, getSnapshot: () => ({ eventNodes: [], runningCalls: [] }), subscribe: () => () => {} } })
const emptyTexts = []
const walk2 = (node) => {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) { node.forEach(walk2); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') { walk2(node.type(node.props)); return }
  if (typeof node.children?.[0] === 'string') emptyTexts.push(node.children[0])
  walk2(node.children)
}
walk2(empty)
assert.ok(!emptyTexts.includes('本轮最常用'), 'no top block without data')
assert.ok(emptyTexts.includes('还没有 skill 路径'), 'empty state still shows')

// A store that never resolves must not crash the slot.
const pending = SkillRouterView({ store: { isReady: () => false, getSnapshot: () => ({ eventNodes: [], runningCalls: [] }), subscribe: () => () => {} } })
assert.ok(pending, 'pending store renders')
assert.equal(collect(undefined).length, 0)

console.log('render smoke passed: 3 skills / 6 vote buttons / empty + pending states')

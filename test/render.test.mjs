// Render smoke test: the view must produce a tree instead of throwing,
// because a throwing slot entry blanks the whole tab.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
let factory = null
globalThis.window = { __ModuleLoader__: { load: (definition) => { factory = definition.factory } } }
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
        { kind: 'tool-call', callId: 'c1', name: 'skill', argsRaw: '{"name":"skill-router"}' },
        { kind: 'tool-call', callId: 'c2', name: 'skill', argsRaw: '{"name":"office-xlsx"}' },
        { kind: 'tool-call', callId: 'c3', name: 'skill', argsRaw: '{"name":"office-xlsx"}' },
        { kind: 'tool-call', callId: 'c4', name: 'skill', argsRaw: '{"name":"univer"}' },
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

const buttons = flat.filter((n) => n.type === 'button')
assert.equal(buttons.length, 6, 'three distinct skills x two vote buttons')
assert.ok(buttons.every((b) => b.props['aria-pressed'] === 'false'))
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

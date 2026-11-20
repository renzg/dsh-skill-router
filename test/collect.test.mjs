// Offline checks for the pure folding logic in client.js.
// Loads the module with a stubbed window/require, so no browser is required.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let factory = null
globalThis.window = { __ModuleLoader__: { load: (definition) => { factory = definition.factory } } }
new Function(source)()

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useSyncExternalStore: () => null,
}
const module_ = factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error('unexpected require: ' + name)
})
const { collect, skillOf, textOf, topSkills, applyVote } = module_.__internals

const at = (stamp) => Date.parse(stamp)

const snapshot = {
  eventNodes: [
    { kind: 'user', seq: 1, time: at('2026-11-20T20:28:00+08:00'), content: [{ type: 'text', text: '跑一遍试试' }] },
    {
      kind: 'assistant', seq: 2, turn: 1, step: 1, time: at('2026-11-20T20:29:00+08:00'),
      blocks: [
        { kind: 'text', text: '先拆需求' },
        { kind: 'tool-call', callId: 'c1', name: 'skill', argsRaw: '{"name":"skill-router"}' },
        { kind: 'tool-call', callId: 'c2', name: 'skill', argsRaw: '{"name":"office-xlsx"}' },
        { kind: 'tool-call', callId: 'c9', name: 'bash', argsRaw: '{"command":"ls"}' },
        { kind: 'tool-call', callId: 'c3', name: 'skill', argsRaw: '{"name":"univer"}' },
        { kind: 'tool-call', callId: 'c8', name: 'skill', argsRaw: '{"name":"univer"}' },
      ],
    },
    { kind: 'tool-result', seq: 3, time: 0, callId: 'c1', isError: false },
    { kind: 'tool-result', seq: 4, time: 0, callId: 'c3', isError: true, error: { name: 'X', code: 'BOOM' } },
    // A turn whose only content is an image must still open its own group.
    { kind: 'user', seq: 5, time: at('2026-11-20T20:35:00+08:00'), content: [{ kind: 'image', attachment: {} }] },
    { kind: 'user', seq: 6, time: at('2026-11-20T20:41:00+08:00'), content: [{ type: 'text', text: '把项目整理成清单' }] },
    {
      kind: 'assistant', seq: 7, turn: 3, step: 1, time: at('2026-11-20T20:41:30+08:00'),
      blocks: [
        { kind: 'tool-call', callId: 'c4', name: 'skill', argsRaw: '{"name":"skill-router"}' },
        { kind: 'tool-call', callId: 'c5', name: 'skill', argsRaw: '{"name":"office-xlsx"}' },
        { kind: 'tool-call', callId: 'c6', name: 'skill', argsRaw: '{"name":"univer-sheet"}' },
      ],
    },
  ],
  runningCalls: [
    // Already dispatched above, still executing: must upgrade pending -> running.
    { callId: 'c6', name: 'skill', argsRaw: '{"name":"univer-sheet"}', time: at('2026-11-20T20:42:00+08:00'), turn: 3 },
  ],
}

const groups = collect(snapshot)
assert.equal(groups.length, 3, 'three request groups, including the image-only one')

assert.equal(groups[0].request, '跑一遍试试')
assert.deepEqual(groups[0].skills.map((s) => s.skill), ['skill-router', 'office-xlsx', 'univer', 'univer'])
assert.equal(groups[0].skills[0].status, 'ok', 'settled call')
assert.equal(groups[0].skills[2].status, 'error', 'error comes from the tool result')
assert.equal(groups[0].skills[3].status, 'pending', 'same call id missing a result stays pending, not ok')
assert.equal(groups[0].skills[0].reuse, false)
assert.equal(groups[0].skills[2].reuse, false, 'a repeated skill inside one turn is not 复用')

assert.equal(groups[1].request, '[图片]', 'image-only turn opens its own card instead of merging into the previous one')
assert.equal(groups[1].skills.length, 0)

assert.equal(groups[2].request, '把项目整理成清单')
assert.deepEqual(groups[2].skills.map((s) => s.skill), ['skill-router', 'office-xlsx', 'univer-sheet'])
assert.equal(groups[2].skills[0].reuse, true, 'skill-router loaded by an earlier request')
assert.equal(groups[2].skills[1].reuse, true, 'office-xlsx loaded by an earlier request')
assert.equal(groups[2].skills[2].reuse, false)
assert.equal(groups[2].skills[2].status, 'running', 'in-flight call upgrades to running')

assert.equal(skillOf('{"name":"office-xlsx"}'), 'office-xlsx')
assert.equal(skillOf('{"name":"univer-sheet"'), 'univer-sheet', 'partial args still parse')
assert.equal(skillOf('{"command":"ls"}'), null)
assert.equal(skillOf(''), null)

assert.equal(textOf([{ kind: 'image' }]), '[图片]')
assert.equal(textOf([{ type: 'text', text: '  a   b ' }]), 'a b')

assert.deepEqual(collect(undefined), [])
assert.deepEqual(collect({ eventNodes: null, runningCalls: null }), [])

const blank = collect({
  eventNodes: [{ kind: 'user', seq: 1, time: 0, content: [] }],
  runningCalls: [],
})
assert.equal(blank[0].request, '（这一轮没有可读的请求文本）', 'a textless turn still gets a placeholder, never the previous request')

const idle = collect({
  eventNodes: [
    { kind: 'user', seq: 1, time: 0, content: [{ type: 'text', text: '随便聊聊' }] },
    { kind: 'assistant', seq: 2, turn: 1, step: 1, time: 0, blocks: [{ kind: 'text', text: '好的' }] },
  ],
  runningCalls: [],
})
assert.equal(idle.length, 1)
assert.equal(idle[0].skills.length, 0)

// --- top-N aggregation -------------------------------------------------
const top = topSkills(groups, 5)
assert.equal(top.length, 4, 'four distinct skills in this session')
assert.equal(top[0].count, 2)
assert.deepEqual(top.map((r) => r.skill), ['office-xlsx', 'skill-router', 'univer', 'univer-sheet'], 'count desc, then name asc')
assert.equal(topSkills(groups, 1).length, 1, 'limit is honoured')
assert.deepEqual(topSkills([]), [])

// --- rating accumulation ------------------------------------------------
let votes = {}
votes = applyVote(votes, 'office-xlsx', 'up')
assert.deepEqual(votes['office-xlsx'], { up: 1, down: 0, mine: 'up' })
votes = applyVote(votes, 'office-xlsx', 'up')
assert.deepEqual(votes['office-xlsx'], { up: 0, down: 0, mine: null }, 'clicking the same side withdraws the vote')
votes = applyVote(votes, 'office-xlsx', 'up')
votes = applyVote(votes, 'office-xlsx', 'down')
assert.deepEqual(votes['office-xlsx'], { up: 0, down: 1, mine: 'down' }, 'switching sides moves the vote')
votes = applyVote(votes, 'office-xlsx', 'up')
assert.deepEqual(votes['office-xlsx'], { up: 1, down: 0, mine: 'up' }, 'switching back restores it')
const carried = applyVote(votes, 'univer', 'down')
assert.equal(carried['office-xlsx'].up, 1, 'voting one skill keeps the others')
assert.deepEqual(carried.univer, { up: 0, down: 1, mine: 'down' })

console.log('rating checks passed: top', JSON.stringify(top.map((r) => r.skill + ':' + r.count)))
console.log('collect() checks passed:', groups.length, 'groups /', groups.flatMap((g) => g.skills).length, 'skill nodes')

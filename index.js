/**
 * Host half: publish the bundled `skill-router` skill and seed the state
 * directory the skill and the panel both read (`~/.dsh/skill-router/`).
 *
 * Seeding never overwrites: routes.md and log.jsonl are the user's data.
 */
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'skill-router'
export const inject = ['skills']

const PROVIDER = 'skill-router'
const SKILL_PATH = fileURLToPath(new URL('./skills/skill-router/SKILL.md', import.meta.url))
const ASSETS = fileURLToPath(new URL('./assets/', import.meta.url))
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const STATE_DIR = join(DSH_HOME, 'skill-router')

function stripFrontmatter(value) {
  if (!value.startsWith('---\n')) return value
  const end = value.indexOf('\n---\n', 4)
  return end === -1 ? value : value.slice(end + 5)
}

function readFrontmatter(value) {
  if (!value.startsWith('---\n')) return {}
  const end = value.indexOf('\n---\n', 4)
  const head = end === -1 ? value.slice(4) : value.slice(4, end)
  const fields = {}
  for (const line of head.split('\n')) {
    const match = /^(name|description):\s*(.+)$/.exec(line)
    if (match) fields[match[1]] = match[2].trim()
  }
  return fields
}

async function candidate() {
  const raw = await readFile(SKILL_PATH, 'utf8')
  const meta = readFrontmatter(raw)
  return {
    name: meta.name || 'skill-router',
    description: meta.description || '需求拆解与技能路由。',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: dirname(SKILL_PATH) + '/' },
    rank: 600,
    locator: SKILL_PATH,
  }
}

const provider = {
  name: PROVIDER,
  async list() {
    try {
      return [await candidate()]
    } catch {
      return []
    }
  },
  async get(entry) {
    const raw = await readFile(entry.locator, 'utf8')
    return {
      name: entry.name,
      description: entry.description,
      invocation: entry.invocation,
      provider: entry.provider,
      source: entry.source,
      ...(entry.resourceBase === undefined ? {} : { resourceBase: entry.resourceBase }),
      content: stripFrontmatter(raw),
    }
  },
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Create the state directory once; never touch what is already there. */
async function seedState() {
  await mkdir(STATE_DIR, { recursive: true })
  const routes = join(STATE_DIR, 'routes.md')
  if (!(await exists(routes))) await copyFile(join(ASSETS, 'routes.md'), routes)
  const script = join(STATE_DIR, 'log.py')
  if (!(await exists(script))) await copyFile(join(ASSETS, 'log.py'), script)
  const log = join(STATE_DIR, 'log.jsonl')
  if (!(await exists(log))) await writeFile(log, '', 'utf8')
}

export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
  void seedState().catch((error) => {
    ctx.logger?.warn?.('skill-router: 状态目录初始化失败 %s', error)
  })
}

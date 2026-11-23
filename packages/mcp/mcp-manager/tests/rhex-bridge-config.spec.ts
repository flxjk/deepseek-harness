/**
 * Parity and launch-safety test for the rhex MCP bridge that this profile loads.
 *
 * The bridge declares every server from the rhex wire (`/Users/gj/git/rhex/.agents/mcp.json`) to
 * `mcp-manager`. A wrong entry is expensive: a stdio server that cannot start is retried on the
 * client's reconnect schedule, so one bad entry becomes a reconnect storm and a server that never
 * registers leaves its tools missing. This test pins the properties that prevent both:
 *
 * - name parity with the wire, and identical command/args/cwd per name;
 * - a non-shell launcher whose executable bit is set and whose entry module exists;
 * - a capped reconnect policy (five attempts on the eager floor, one everywhere else);
 * - the declared eager floor, with every other entry on demand.
 *
 * The bridge file is read as text and parsed with a strict reader for the flow style the generator
 * emits; an accidental format change fails here instead of silently passing.
 */
import { readFileSync, statSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const RHEX_ROOT = '/Users/gj/git/rhex'
const BRIDGE_REL = `${RHEX_ROOT}/.dsh/plugins/rhex-mcp-bridge/cordis.patch.yml`
const WIRE_REL = `${RHEX_ROOT}/.agents/mcp.json`

const EAGER_FLOOR = ['tsp-core', 'token-tools', 'knowledge-broker', 'workspace-ops', 'deepseek-harness']

interface BridgeEntry {
  readonly name: string
  readonly fields: ReadonlyMap<string, string>
}

/** Splits a flow mapping body on top-level commas, ignoring commas inside `{}` and `[]`. */
function splitTopLevel(body: string): readonly string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, index).trim())
      start = index + 1
    }
  }
  const tail = body.slice(start).trim()
  if (tail.length > 0) parts.push(tail)
  return parts
}

/** Reads the bridge patch into one row per declared server. */
function readBridge(): readonly BridgeEntry[] {
  const text = readFileSync(BRIDGE_REL, 'utf8')
  const rows: BridgeEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^ {6}([a-z0-9-]+): \{ (.*) \}$/)
    const name = match?.[1]
    const body = match?.[2]
    if (name === undefined || body === undefined) continue
    const fields = new Map<string, string>()
    for (const part of splitTopLevel(body)) {
      const separator = part.indexOf(': ')
      if (separator < 0) throw new Error(`unparsable bridge field: ${part}`)
      fields.set(part.slice(0, separator).trim(), part.slice(separator + 2).trim())
    }
    rows.push({ name, fields })
  }
  return rows
}

interface WireEntry {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
}

/** Reads the rhex wire exactly as the other hosts consume it. */
function readWire(): readonly WireEntry[] {
  const parsed = JSON.parse(readFileSync(WIRE_REL, 'utf8')) as {
    mcpServers: Record<string, { command: string; args: string[] }>
  }
  return Object.entries(parsed.mcpServers).map(([name, entry]) => ({
    name,
    command: entry.command,
    args: entry.args,
  }))
}

/** Extracts the members of a flow sequence field such as `[a.ts, b.ts]`. */
function listField(value: string | undefined): readonly string[] {
  if (value === undefined) return []
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  return inner.length === 0 ? [] : inner.split(',').map(item => item.trim())
}

describe('rhex MCP bridge', () => {
  const bridge = readBridge()
  const wire = readWire()

  it('declares every server of the rhex wire, once', () => {
    expect(bridge.length).toBe(wire.length)
    const names = bridge.map(row => row.name)
    expect(new Set(names).size).toBe(names.length)
    expect([...names].sort()).toEqual(wire.map(row => row.name).sort())
  })

  it('keeps command, arguments and cwd identical to the wire for every server', () => {
    const byName = new Map(bridge.map(row => [row.name, row.fields]))
    const mismatched: string[] = []
    for (const entry of wire) {
      const fields = byName.get(entry.name)
      if (fields === undefined) {
        mismatched.push(`${entry.name}: absent from the bridge`)
        continue
      }
      const command = fields.get('command') ?? ''
      const args = listField(fields.get('args'))
      const cwd = fields.get('cwd') ?? ''
      const expectedCommand = `${RHEX_ROOT}/${entry.command}`
      if (command !== expectedCommand) mismatched.push(`${entry.name}: command ${command} != ${expectedCommand}`)
      if (JSON.stringify(args) !== JSON.stringify(entry.args)) mismatched.push(`${entry.name}: args ${JSON.stringify(args)} != ${JSON.stringify(entry.args)}`)
      if (cwd !== RHEX_ROOT) mismatched.push(`${entry.name}: cwd ${cwd} != ${RHEX_ROOT}`)
    }
    expect(mismatched).toEqual([])
  })

  it('launches without a shell and every declared file exists', () => {
    const broken: string[] = []
    for (const row of bridge) {
      const command = row.fields.get('command') ?? ''
      const args = listField(row.fields.get('args'))
      if (command === '' || /(^|\/)(ba)?sh$/.test(command)) broken.push(`${row.name}: shell command ${command}`)
      if (!existsSync(command)) broken.push(`${row.name}: command missing on disk`)
      else if ((statSync(command).mode & 0o111) === 0) broken.push(`${row.name}: command is not executable`)
      if (args.length !== 1) broken.push(`${row.name}: expected exactly one entry argument, saw ${args.length}`)
      const entry = args[0] ?? ''
      if (entry !== '' && !existsSync(`${RHEX_ROOT}/${entry}`)) broken.push(`${row.name}: entry module ${entry} is missing`)
      const cwd = row.fields.get('cwd') ?? ''
      if (!existsSync(cwd)) broken.push(`${row.name}: cwd ${cwd} is missing`)
    }
    expect(broken).toEqual([])
  })

  it('caps the reconnect policy so a broken entry cannot storm', () => {
    const offenders: string[] = []
    for (const row of bridge) {
      const reconnect = row.fields.get('reconnect') ?? ''
      const attempts = Number((reconnect.match(/maxAttempts: (\d+)/) ?? [])[1] ?? Number.NaN)
      const enabled = /enabled: true/.test(reconnect)
      const budget = EAGER_FLOOR.includes(row.name) ? 5 : 1
      if (!enabled) offenders.push(`${row.name}: reconnect disabled, so a lost server never returns`)
      if (!Number.isFinite(attempts)) offenders.push(`${row.name}: reconnect policy declares no attempt budget`)
      else if (attempts > budget) offenders.push(`${row.name}: maxAttempts ${attempts} exceeds ${budget}`)
    }
    expect(offenders).toEqual([])
  })

  it('declares the eager floor and keeps every other server on demand', () => {
    const wrong: string[] = []
    for (const row of bridge) {
      const loading = row.fields.get('toolLoading') ?? ''
      const expected = EAGER_FLOOR.includes(row.name) ? 'eager' : 'on-demand'
      if (loading !== expected) wrong.push(`${row.name}: ${loading} != ${expected}`)
      const startup = Number(row.fields.get('startupTimeoutMs') ?? Number.NaN)
      if (!Number.isFinite(startup) || startup < 30_000) wrong.push(`${row.name}: startup budget ${startup}`)
    }
    expect(wrong).toEqual([])
    expect(bridge.filter(row => row.fields.get('toolLoading') === 'eager').map(row => row.name).sort()).toEqual([...EAGER_FLOOR].sort())
  })
})

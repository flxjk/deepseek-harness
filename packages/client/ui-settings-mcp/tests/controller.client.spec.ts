import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpManagedServerView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  draftOf, McpServersController, SERVERS_FIELD,
  type McpServerEntry, type McpServerDraft, type McpSettings,
  type McpServersRemote, type McpStreamFrame, type McpStreamHandle,
} from '../src/client/mcp-servers-controller.ts'

const controllers: McpServersController[] = []
const streamsToQuiescence: Promise<void>[] = []

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.dispose()
  await Promise.all(streamsToQuiescence.splice(0))
})

interface SettingsWrite {
  field: string
  value: unknown
}

function stdioEntry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    transport: 'stdio', command: 'node', args: ['--fast'], env: { TOKEN: 'stdio-secret' }, cwd: '/servers/stdio',
    url: '', headers: {}, enabled: true, startupTimeoutMs: 30_000,
    reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 2_000, maxAttempts: 4 },
    ...overrides,
  }
}

function httpEntry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    transport: 'streamable-http', command: '', args: [], env: {}, cwd: '',
    url: 'https://mcp.example.test', headers: { Authorization: 'Bearer http-secret' }, enabled: true,
    startupTimeoutMs: 30_000, reconnect: { enabled: false, initialDelayMs: 100, maxDelayMs: 2_000, maxAttempts: 4 },
    ...overrides,
  }
}

function createController(servers: Record<string, McpServerEntry>) {
  const writes: SettingsWrite[] = []
  const snapshot: ConfigFormSnapshot<McpSettings> = {
    status: 'ready', value: { servers }, base: undefined, user: undefined, revision: 1, writable: true,
  }
  const scope: ConfigForm<McpSettings> = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    mutate: async () => true,
    set: async (field, value) => { writes.push({ field, value }); return true },
    unset: async () => true,
  }
  const controller = new McpServersController(scope, remote())
  controllers.push(controller)
  return { controller, writes }
}

function remote(): McpServersRemote {
  return {
    $stream: <Item>() => stream<Item>(),
    mcpManager: {
      watch: async function* (): AsyncGenerator<McpManagedServerView[]> {},
      restart: async () => ({ ok: true, value: undefined }),
      probe: async () => ({
        ok: true,
        value: { ok: true, toolNames: [], truncated: false, durationMs: 0, closeConfirmed: true },
      }),
    },
  }
}

function stream<Item>(): McpStreamHandle<Item> {
  let release!: () => void
  let settled!: () => void
  const ending = new Promise<void>((resolve) => { release = resolve })
  const quiescent = new Promise<void>((resolve) => { settled = resolve })
  streamsToQuiescence.push(quiescent)
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<McpStreamFrame<Item>> {
      try {
        await ending
      } finally {
        settled()
      }
    },
    dispose: async () => { release(); await quiescent },
  }
}

function draft(name: string, change: Partial<McpServerDraft>): McpServerDraft {
  return { ...draftOf(name, undefined), ...change }
}

describe('McpServersController settings writes', () => {
  it('writes only each transport’s fields when adding an HTTP server', async () => {
    const stdio = stdioEntry({ toolCallTimeoutMs: 45_000, closeTimeoutMs: 8_000 })
    const http = httpEntry({ enabled: false, startupTimeoutMs: 18_000 })
    const { controller, writes } = createController({ alpha: stdio, gamma: http })

    await expect(controller.addServer(draft(' beta ', {
      transport: 'streamable-http', url: ' https://new.example.test ', headersText: 'Authorization: Bearer new-secret',
    }))).resolves.toBe(true)

    expect(writes).toEqual([{
      field: SERVERS_FIELD,
      value: {
        alpha: {
          enabled: true, transport: 'stdio', command: 'node', args: ['--fast'],
          env: { TOKEN: 'stdio-secret' }, cwd: '/servers/stdio', startupTimeoutMs: 30_000,
          reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 2_000, maxAttempts: 4 },
          toolCallTimeoutMs: 45_000, closeTimeoutMs: 8_000,
        },
        gamma: {
          enabled: false, transport: 'streamable-http', url: 'https://mcp.example.test',
          headers: { Authorization: 'Bearer http-secret' }, startupTimeoutMs: 18_000,
          reconnect: { enabled: false, initialDelayMs: 100, maxDelayMs: 2_000, maxAttempts: 4 },
        },
        beta: {
          enabled: true, transport: 'streamable-http', url: 'https://new.example.test',
          headers: { Authorization: 'Bearer new-secret' },
        },
      },
    }])
  })

  it('carries manager options when editing an entry to use the other transport', async () => {
    const existing = stdioEntry({
      enabled: false, startupTimeoutMs: 12_000, toolCallTimeoutMs: 50_000, closeTimeoutMs: 9_000,
    })
    const { controller, writes } = createController({ alpha: existing })

    await expect(controller.updateServer('alpha', draft('alpha', {
      transport: 'streamable-http', url: 'https://edited.example.test', headersText: 'X-Token: updated',
    }))).resolves.toBe(true)

    expect(writes).toEqual([{
      field: SERVERS_FIELD,
      value: {
        alpha: {
          enabled: false, transport: 'streamable-http', url: 'https://edited.example.test',
          headers: { 'X-Token': 'updated' }, startupTimeoutMs: 12_000,
          reconnect: existing.reconnect, toolCallTimeoutMs: 50_000, closeTimeoutMs: 9_000,
        },
      },
    }])
  })

  it('reprojects every entry when toggling or removing one server', async () => {
    const stdio = stdioEntry()
    const http = httpEntry({ startupTimeoutMs: 20_000 })
    const toggled = createController({ alpha: stdio, beta: http })
    toggled.controller.setEnabled('alpha', false)
    await vi.waitFor(() => { expect(toggled.writes).toHaveLength(1) })
    expect(toggled.writes[0]).toEqual({
      field: SERVERS_FIELD,
      value: {
        alpha: {
          enabled: false, transport: 'stdio', command: 'node', args: ['--fast'],
          env: { TOKEN: 'stdio-secret' }, cwd: '/servers/stdio', startupTimeoutMs: 30_000,
          reconnect: stdio.reconnect,
        },
        beta: {
          enabled: true, transport: 'streamable-http', url: 'https://mcp.example.test',
          headers: { Authorization: 'Bearer http-secret' }, startupTimeoutMs: 20_000,
          reconnect: http.reconnect,
        },
      },
    })

    const removed = createController({ alpha: stdio, beta: http })
    removed.controller.removeServer('alpha')
    await vi.waitFor(() => { expect(removed.writes).toHaveLength(1) })
    expect(removed.writes[0]).toEqual({
      field: SERVERS_FIELD,
      value: {
        beta: {
          enabled: true, transport: 'streamable-http', url: 'https://mcp.example.test',
          headers: { Authorization: 'Bearer http-secret' }, startupTimeoutMs: 20_000,
          reconnect: http.reconnect,
        },
      },
    })
  })
})

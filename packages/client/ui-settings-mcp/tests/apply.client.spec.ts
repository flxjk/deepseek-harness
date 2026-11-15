/** What the browser half registers, when, and that it leaves with the fiber. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject, NS } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

/** One Host view of a served settings namespace. */
function view(ns: string, revision = 0) {
  return { ns, schema: {}, value: { servers: {} }, applies: 'live', secrets: [], revision }
}

/** @param served - namespaces the Host describes. */
async function bench(served: string[]) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const describeSettings = vi.fn(() => Promise.resolve(
    { ok: true, value: { writable: true, hasDocument: true, namespaces: served.map(ns => view(ns)) } }))
  const remote = new TestRemote(ctx, {
    settings: { describe: describeSettings },
    mcpManager: {
      watch: () => (async function* () { yield [] })(),
      restart: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
      probe: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
    },
  })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, describeSettings, remote }
}

/** The Plugins page's item slot, as its owner declares it. */
function declareRoot(slots: SlotRegistry): void {
  slots.register({ name: 'root', children: { 'plugins.item': { kind: 'list', scope: 'root' } } } as never, () => null)
}

describe('ui-settings-mcp apply', () => {
  it('keeps the node half inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.mcpManager', 'configForms'])
  })

  it('registers the page while the Host serves the manager namespace', async () => {
    const { ctx, slots } = await bench(['mcp-manager'])
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('plugins.item')).toHaveLength(1) })
    const entries = slots.entries('plugins.item')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options).toMatchObject({ id: 'mcp', order: 25 })
    expect(entries[0]?.locale).toBe(NS)
  })

  it('registers nothing while the manager namespace is not served', async () => {
    const { ctx, slots, describeSettings } = await bench(['settings'])
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(describeSettings).toHaveBeenCalled() })
    expect(slots.entries('plugins.item')).toHaveLength(0)
  })

  it('collapses the page on teardown', async () => {
    const { ctx, slots } = await bench(['mcp-manager'])
    declareRoot(slots)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(slots.entries('plugins.item')).toHaveLength(1) })
    await fiber.dispose()
    expect(slots.entries('plugins.item')).toHaveLength(0)
  })
})

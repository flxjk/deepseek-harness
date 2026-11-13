/**
 * The MCP servers settings page, browser half: one page on the Plugins page
 * listing every managed MCP server with its live status, and letting the user
 * add, edit, enable or disable, delete, restart, and probe servers.
 *
 * The page registers into the Plugins page's `plugins.item` slot while the
 * Host serves the `mcp-manager` settings namespace, and the live server list
 * comes from the `mcpManager` Remote namespace. A server only a plugin
 * registered is listed read-only apart from restart.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: the renderer's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the mcpManager namespace face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { McpServersPage } from './McpServersPage.tsx'
import { MCP_NS, McpServersController, type McpSettings } from './mcp-servers-controller.ts'
import { en, ja, es, fr, de, ru, pt, zh, type McpSettingsLocaleKey } from './locales.ts'

export type { McpServersPageProps } from './McpServersPage.tsx'
export type {
  McpDraftOutcome, McpDraftProblem, McpManagedServerStatus, McpProbeOutcome, McpProbeView, McpReconnectSettings,
  McpRowProblem, McpServerDraft, McpServerEntry, McpServerEntryWrite, McpServerRow, McpServersFace, McpServersRemote,
  McpServersState, McpSettings, McpStreamFrame, McpStreamHandle, McpTransport,
} from './mcp-servers-controller.ts'
export type { McpSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP servers settings page copy. */
    'settings.mcp': McpSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpManager', 'configForms']

/**
 * Mount the MCP servers page while the Host serves the `mcp-manager` settings namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-settings-mcp: dictionaries')
  const controller = new McpServersController(ctx.configForms.get<McpSettings>(MCP_NS), ctx.remote)
  ctx.effect(() => () => { controller.dispose() }, 'ui-settings-mcp: page state')
  ctx.effect(() => ctx.configForms.whileServed([MCP_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'mcp', order: 25, label: () => t('title'), locale: NS, inject: () => controller.inject(),
  }, McpServersPage))), 'ui-settings-mcp: page')
}

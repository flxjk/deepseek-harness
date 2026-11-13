/**
 * The MCP servers page's state: the configured entries under the manager's
 * `servers` field, the live server list from `remote.mcpManager.watch`, and
 * the writes, restarts, and probes the page's controls request.
 *
 * The settings section is the write authority. A name it holds can be enabled,
 * disabled, edited, or deleted; a server only a plugin registered stays
 * read-only apart from restart. Every write sends the whole `servers` record
 * built from the record the Host last accepted, so one edit never disturbs
 * another entry, and the fields this page does not edit — startup, tool-call,
 * and close budgets, and the reconnect policy — survive an edit unchanged.
 *
 * One live list arrives as a supervised Remote stream while the Host serves
 * the namespace; a stream that ends or loses its carrier keeps the last list
 * and offers a retry. A status the settings section has no view for yet reads
 * as connecting, or as disabled while the entry asks for no live instance.
 *
 * Here rather than in the page: every value the page renders and every write
 * its controls request. The presentation half owns copy and layout only.
 */

import type { ClientRemote, McpManagedServerView, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Settings namespace of the MCP manager's Loader entry. */
export const MCP_NS = 'mcp-manager'

/** The only field of that section this page edits. */
export const SERVERS_FIELD = 'servers'

/**
 * Server key pattern the manager accepts, spelled here rather than imported: a
 * client package must not depend on the Host package that declares it.
 */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Transport one configured entry uses. */
export type McpTransport = 'stdio' | 'streamable-http'

/**
 * Reconnect policy of one entry. The page preserves it but does not edit it,
 * so its fields are optional here.
 */
export interface McpReconnectSettings {
  /** Reconnect automatically after a lost connection. */
  enabled?: boolean
  /** First reconnect delay in milliseconds. */
  initialDelayMs?: number
  /** Backoff ceiling in milliseconds. */
  maxDelayMs?: number
  /** Consecutive failed attempts per outage before giving up. */
  maxAttempts?: number
}

/**
 * One configured server entry as the manager's settings section resolves it.
 * Spelled here rather than imported for the same reason as the key pattern.
 */
export interface McpServerEntry {
  /** Which transport the instance uses. */
  transport: McpTransport
  /** stdio: executable used to start the server. */
  command: string
  /** stdio: arguments passed without shell interpolation. */
  args: readonly string[]
  /** stdio: extra child environment. */
  env: Readonly<Record<string, string>>
  /** stdio: working directory for the child process. */
  cwd: string
  /** streamable-http: MCP endpoint URL. */
  url: string
  /** streamable-http: extra request headers. */
  headers: Readonly<Record<string, string>>
  /** Durable intent: whether the entry asks for a running instance. */
  enabled: boolean
  /** Per-tool-call timeout override in milliseconds. */
  toolCallTimeoutMs?: number
  /** Per-attempt startup budget in milliseconds. */
  startupTimeoutMs: number
  /** Cleanup budget override in milliseconds. */
  closeTimeoutMs?: number
  /** Reconnect policy. */
  reconnect: McpReconnectSettings
}

/** The MCP manager's settings section. */
export interface McpSettings {
  /** Managed servers keyed by server name. */
  servers: Readonly<Record<string, McpServerEntry>>
}

/**
 * One entry as this page writes it: exactly the fields of the transport the
 * entry uses, plus the budgets and reconnect policy it carries over from the
 * entry it replaces. Absent ones are filled by the manager's schema, so a
 * stdio write never spells the streamable-http fields and the other way around.
 */
export type McpServerEntryWrite = McpStdioEntryWrite | McpStreamableHttpEntryWrite

/** Fields this page preserves from the entry it replaces but does not edit. */
type McpCarriedFields =
  Partial<Pick<McpServerEntry, 'startupTimeoutMs' | 'reconnect' | 'toolCallTimeoutMs' | 'closeTimeoutMs'>>

/** The stdio variant of one write. */
type McpStdioEntryWrite =
  Pick<McpServerEntry, 'enabled' | 'command' | 'args' | 'env' | 'cwd'>
  & McpCarriedFields
  & { transport: 'stdio' }

/** The streamable-http variant of one write. */
type McpStreamableHttpEntryWrite =
  Pick<McpServerEntry, 'enabled' | 'url' | 'headers'>
  & McpCarriedFields
  & { transport: 'streamable-http' }

/** Why a staged draft cannot be written. */
export type McpDraftProblem =
  | { kind: 'nameEmpty' }
  | { kind: 'nameInvalid' }
  | { kind: 'nameTaken' }
  | { kind: 'commandRequired' }
  | { kind: 'urlRequired' }
  | { kind: 'envLine'; line: number }
  | { kind: 'headersLine'; line: number }

/** What one staged draft becomes. */
export type McpDraftOutcome =
  | { ok: true; entry: McpServerEntryWrite }
  | { ok: false; problem: McpDraftProblem }

/** One server's staged transport fields, as the editor holds them. */
export interface McpServerDraft {
  /** Server key; fixed while editing an existing entry. */
  name: string
  /** Which transport the entry uses. */
  transport: McpTransport
  /** stdio: executable to start. */
  command: string
  /** stdio: arguments, one per line. */
  argsText: string
  /** stdio: working directory. */
  cwd: string
  /** stdio: extra environment, one `KEY=value` per line. */
  envText: string
  /** streamable-http: endpoint URL. */
  url: string
  /** streamable-http: extra headers, one `KEY: value` per line. */
  headersText: string
}

/** Why one row's last action failed; the page renders the localized notice. */
export type McpRowProblem = 'write' | 'restart' | 'probe'

/** One probe outcome as the page shows it. */
export interface McpProbeView {
  /** Whether the probe reached a tool listing. */
  ok: boolean
  /** Advertised tool count of a successful probe. */
  toolCount: number
  /** Whether the advertised list was longer than the returned names. */
  truncated: boolean
  /** Server-reported identity of a successful probe, when the SDK captured one. */
  server: { name: string; version: string } | undefined
  /** Wall-clock duration of negotiation and listing, in milliseconds. */
  durationMs: number
  /** Stage a failed probe is attributed to. */
  stage: 'connect' | 'list' | undefined
  /** Diagnostic text of a failed probe. */
  message: string | undefined
}

/** One managed server as the page lists it. */
export interface McpServerRow {
  /** The configured key or registered name; also the `mcp__<name>__` tool namespace. */
  name: string
  /** Whether the settings section holds this entry, which is what allows editing and deleting it. */
  configured: boolean
  /** Whether a plugin registered this server for its own lifetime instead of the settings document. */
  runtimeOnly: boolean
  /** The configured entry's transport; undefined for a runtime-only server. */
  transport: McpTransport | undefined
  /** The configured entry's durable enable intent; true for a runtime-only server. */
  enabled: boolean
  /** The configured entry as the editor stages it; undefined for a runtime-only server. */
  entry: McpServerEntry | undefined
  /** Latest runtime status, or the intent the settings section states before a view arrives. */
  status: McpManagedServerStatus
  /** Latest probe outcome, until the next probe replaces it. */
  probe: McpProbeView | undefined
  /** Action in flight for this row. */
  busy: 'restart' | 'probe' | undefined
  /** Why this row's last action failed. */
  problem: McpRowProblem | undefined
}

/** Runtime status of one managed server, as the manager publishes it. */
export type McpManagedServerStatus = McpManagedServerView['status']

/** What the page renders. */
export interface McpServersState {
  /** Sync state of the manager's settings section. */
  status: 'loading' | 'ready' | 'unavailable'
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** Whether the live list stream failed; the rows keep the last list read. */
  readFailed: boolean
  /** Every managed server, merged from the settings section and the live list, ordered by name. */
  servers: readonly McpServerRow[]
}

/** One item of a supervised Remote stream: the decoded value plus its acceptance. */
export interface McpStreamFrame<Item> {
  /** Decoded item the generated Remote method yielded. */
  readonly value: Item
  /** Mark the item accepted, so a normal generation end is retried rather than treated as terminal. */
  accept(): void
}

/** One supervised logical Remote stream. */
export interface McpStreamHandle<Item> extends AsyncIterable<McpStreamFrame<Item>> {
  /** Stop the stream; resolves once its iterator is quiescent. */
  dispose(): Promise<void>
}

/** One probe outcome as the Host's generated Remote method returns it. */
export type McpProbeOutcome = Extract<Awaited<ReturnType<ClientRemote['mcpManager']['probe']>>, { ok: true }>['value']

/** The slice of the Client Remote face this page calls. */
export interface McpServersRemote {
  /**
   * Supervise one logical stream across carrier generations.
   */
  $stream: <Item>(options: {
    readonly name: string
    readonly open: (signal: AbortSignal) => AsyncIterable<Item>
    readonly ended: (accepted: boolean) => Error
  }) => McpStreamHandle<Item>
  /** The MCP manager namespace. */
  mcpManager: {
    /** Stream the complete managed server list after each change. */
    watch: (signal?: AbortSignal) => AsyncIterable<McpManagedServerView[]>
    /** Rebuild one server from its current entry. */
    restart: (name: string) => Promise<RemoteResult<void>>
    /** Probe one server without touching its live instance. */
    probe: (name: string, signal?: AbortSignal) => Promise<RemoteResult<McpProbeOutcome>>
  }
}

/** The registration-side face the page's slot entry injects. */
export interface McpServersFace {
  hooks: {
    /** Page snapshot bound by the renderer as useMcpServers. */
    mcpServers: SnapshotStore<McpServersState>
  }
  /**
   * Add one configured entry.
   * @param draft - the staged transport fields.
   * @returns whether the Host accepted the write.
   */
  addServer: (draft: McpServerDraft) => Promise<boolean>
  /**
   * Replace one configured entry's transport fields.
   * @param name - the settings key.
   * @param draft - the staged transport fields.
   * @returns whether the Host accepted the write.
   */
  updateServer: (name: string, draft: McpServerDraft) => Promise<boolean>
  /**
   * Write one configured entry's durable enable intent.
   * @param name - the settings key.
   * @param enabled - whether the entry asks for a running instance.
   */
  setEnabled: (name: string, enabled: boolean) => void
  /**
   * Delete one configured entry.
   * @param name - the settings key.
   */
  removeServer: (name: string) => void
  /**
   * Rebuild one server from its current entry.
   * @param name - the configured or registered server key.
   */
  restart: (name: string) => void
  /**
   * Probe one server without touching its live instance.
   * @param name - the configured or registered server key.
   */
  probe: (name: string) => void
  /** Reopen the live server list after a stream failure. */
  retry: () => void
}

/**
 * Parse one `KEY=value` or `KEY: value` line block.
 * @param text - the staged block; blank lines are skipped.
 * @param separator - character separating a key from its value; the first occurrence splits.
 * @returns the pairs, or the one-based number of the first line without a key or separator.
 */
export function parsePairLines(
  text: string,
  separator: '=' | ':',
): { ok: true; value: Record<string, string> } | { ok: false; line: number } {
  const value: Record<string, string> = {}
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue
    const at = line.indexOf(separator)
    if (at <= 0) return { ok: false, line: index + 1 }
    value[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return { ok: true, value }
}

/**
 * The arguments one staged block names, ignoring blank lines.
 * @param text - the staged block, one argument per line.
 * @returns the arguments in order.
 */
function argumentLines(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(line => line !== '')
}

/**
 * Render one pair record as staged lines.
 * @param pairs - the entry's environment or headers.
 * @param separator - character written between a key and its value.
 * @returns one line per pair.
 */
function pairLines(pairs: Readonly<Record<string, string>>, separator: string): string {
  return Object.entries(pairs).map(([key, value]) => `${key}${separator}${value}`).join('\n')
}

/**
 * The editor's staged fields for one server.
 * @param name - the server key.
 * @param entry - the configured entry, or undefined while adding.
 * @returns the draft the editor starts from.
 */
export function draftOf(name: string, entry: McpServerEntry | undefined): McpServerDraft {
  if (entry === undefined) {
    return { name, transport: 'stdio', command: '', argsText: '', cwd: '', envText: '', url: '', headersText: '' }
  }
  return entry.transport === 'stdio'
    ? {
      name, transport: 'stdio', command: entry.command, argsText: entry.args.join('\n'), cwd: entry.cwd,
      envText: pairLines(entry.env, '='), url: '', headersText: '',
    }
    : {
      name, transport: 'streamable-http', command: '', argsText: '', cwd: '', envText: '',
      url: entry.url, headersText: pairLines(entry.headers, ': '),
    }
}

/**
 * The budgets and reconnect policy one write carries over from the entry it
 * replaces.
 * @param existing - the entry being replaced, or undefined while adding.
 * @returns the carried fields, empty while adding.
 */
function carriedFields(existing: McpServerEntry | undefined): McpCarriedFields {
  if (existing === undefined) return {}
  return {
    startupTimeoutMs: existing.startupTimeoutMs,
    reconnect: existing.reconnect,
    ...existing.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: existing.toolCallTimeoutMs },
    ...existing.closeTimeoutMs === undefined ? {} : { closeTimeoutMs: existing.closeTimeoutMs },
  }
}

/**
 * Build the entry one staged draft writes, or name why it cannot be written.
 * @param draft - the staged transport fields.
 * @param existing - the entry being replaced, whose unedited fields are carried over.
 * @param nameTaken - whether another entry already uses the draft's name.
 * @returns the entry to write, or the refusal the editor shows.
 */
export function draftEntry(
  draft: McpServerDraft,
  existing: McpServerEntry | undefined,
  nameTaken: boolean,
): McpDraftOutcome {
  const name = draft.name.trim()
  if (name === '') return { ok: false, problem: { kind: 'nameEmpty' } }
  if (!SERVER_NAME_PATTERN.test(name)) return { ok: false, problem: { kind: 'nameInvalid' } }
  if (nameTaken) return { ok: false, problem: { kind: 'nameTaken' } }
  const carried = carriedFields(existing)
  const enabled = existing?.enabled ?? true
  if (draft.transport === 'stdio') {
    if (draft.command.trim() === '') return { ok: false, problem: { kind: 'commandRequired' } }
    const env = parsePairLines(draft.envText, '=')
    if (!env.ok) return { ok: false, problem: { kind: 'envLine', line: env.line } }
    return {
      ok: true,
      entry: {
        ...carried, enabled, transport: 'stdio', command: draft.command.trim(),
        args: argumentLines(draft.argsText), env: env.value, cwd: draft.cwd.trim(),
      },
    }
  }
  if (draft.url.trim() === '') return { ok: false, problem: { kind: 'urlRequired' } }
  const headers = parsePairLines(draft.headersText, ':')
  if (!headers.ok) return { ok: false, problem: { kind: 'headersLine', line: headers.line } }
  return { ok: true, entry: { ...carried, enabled, transport: 'streamable-http', url: draft.url.trim(), headers: headers.value } }
}

/**
 * Project one configured entry onto the write variant its transport names, so
 * a write replacing the whole record leaves every other entry unchanged.
 * @param entry - the configured entry.
 * @returns the entry as this page writes it.
 */
function writeOf(entry: McpServerEntry): McpServerEntryWrite {
  const carried = carriedFields(entry)
  return entry.transport === 'stdio'
    ? {
      ...carried, enabled: entry.enabled, transport: 'stdio',
      command: entry.command, args: entry.args, env: entry.env, cwd: entry.cwd,
    }
    : {
      ...carried, enabled: entry.enabled, transport: 'streamable-http',
      url: entry.url, headers: entry.headers,
    }
}

/**
 * Project one probe outcome onto what the page renders.
 * @param result - the outcome the Host returned.
 * @returns the tool count and identity of a success, or the stage and message of a failure.
 */
export function probeView(result: McpProbeOutcome): McpProbeView {
  return result.ok
    ? {
      ok: true, toolCount: result.toolNames.length, truncated: result.truncated,
      server: result.serverInfo ?? undefined, durationMs: result.durationMs, stage: undefined, message: undefined,
    }
    : {
      ok: false, toolCount: 0, truncated: false, server: undefined,
      durationMs: result.durationMs, stage: result.stage, message: result.message,
    }
}

/**
 * Order server names by code unit, so the list keeps one order in every locale.
 * @param left - first name.
 * @param right - second name.
 * @returns the comparison result.
 */
function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Bridges the manager's settings section and its live server list onto the page. */
export class McpServersController {
  private readonly store: SnapshotStore<McpServersState>
  private readonly unsubscribe: () => void
  /** Cancellation lifetime of the probes this page started. */
  private readonly probeLifetime = new AbortController()
  private readonly problems = new Map<string, McpRowProblem>()
  private readonly probes = new Map<string, McpProbeView>()
  private readonly busy = new Map<string, 'restart' | 'probe'>()
  private views: readonly McpManagedServerView[] = []
  private stream: McpStreamHandle<readonly McpManagedServerView[]> | undefined
  /** Generation counter: only the newest stream may publish or report failure. */
  private streamGeneration = 0
  private readFailed = false
  private writeTail: Promise<unknown> = Promise.resolve()
  private disposed = false

  /**
   * @param scope - the shared form over the manager's settings section.
   * @param remote - the Client Remote face carrying the manager's namespace.
   */
  constructor(
    private readonly scope: ConfigForm<McpSettings>,
    private readonly remote: McpServersRemote,
  ) {
    this.store = createSnapshotStore(this.projection())
    this.unsubscribe = scope.subscribe(() => { this.syncStream(); this.publish() })
    this.syncStream()
  }

  /**
   * Add one configured entry.
   * @param draft - the staged transport fields.
   * @returns whether the Host accepted the write.
   */
  addServer(draft: McpServerDraft): Promise<boolean> {
    const name = draft.name.trim()
    const outcome = draftEntry(draft, undefined, this.servers()[name] !== undefined)
    if (!outcome.ok) return Promise.resolve(false)
    return this.write(name, servers => ({ ...this.writeRecord(servers), [name]: outcome.entry }))
  }

  /**
   * Replace one configured entry's transport fields.
   * @param name - the settings key.
   * @param draft - the staged transport fields.
   * @returns whether the Host accepted the write.
   */
  updateServer(name: string, draft: McpServerDraft): Promise<boolean> {
    const existing = this.servers()[name]
    if (existing === undefined) return Promise.resolve(false)
    const outcome = draftEntry(draft, existing, false)
    if (!outcome.ok) return Promise.resolve(false)
    return this.write(name, servers => ({ ...this.writeRecord(servers), [name]: outcome.entry }))
  }

  /**
   * Write one configured entry's durable enable intent.
   * @param name - the settings key.
   * @param enabled - whether the entry asks for a running instance.
   */
  setEnabled(name: string, enabled: boolean): void {
    const entry = this.servers()[name]
    if (entry === undefined) return
    void this.write(name, servers => ({ ...this.writeRecord(servers), [name]: writeOf({ ...entry, enabled }) }))
  }

  /**
   * Delete one configured entry.
   * @param name - the settings key.
   */
  removeServer(name: string): void {
    if (this.servers()[name] === undefined) return
    void this.write(name, (servers) => {
      const next: Record<string, McpServerEntryWrite> = {}
      for (const [key, value] of Object.entries(servers)) if (key !== name) next[key] = writeOf(value)
      return next
    })
  }

  /**
   * Rebuild one server from its current entry.
   * @param name - the configured or registered server key.
   */
  restart(name: string): void {
    void this.action(name, 'restart', async () => {
      const result = await this.remote.mcpManager.restart(name)
      return result.ok ? undefined : 'restart'
    })
  }

  /**
   * Probe one server without touching its live instance.
   * @param name - the configured or registered server key.
   */
  probe(name: string): void {
    void this.action(name, 'probe', async () => {
      const result = await this.remote.mcpManager.probe(name, this.probeLifetime.signal)
      if (!result.ok) return 'probe'
      this.probes.set(name, probeView(result.value))
      return undefined
    })
  }

  /** Reopen the live server list after a stream failure. */
  retry(): void {
    if (this.scope.getSnapshot().status !== 'ready') return
    this.openStream()
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its actions.
   */
  inject(): McpServersFace {
    return {
      hooks: { mcpServers: this.store },
      addServer: draft => this.addServer(draft),
      updateServer: (name, draft) => this.updateServer(name, draft),
      setEnabled: (name, enabled) => { this.setEnabled(name, enabled) },
      removeServer: (name) => { this.removeServer(name) },
      restart: (name) => { this.restart(name) },
      probe: (name) => { this.probe(name) },
      retry: () => { this.retry() },
    }
  }

  /** Release the stream, cancel pending probes, and stop publishing. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    this.probeLifetime.abort(new Error('mcp servers page disposed'))
    this.stopStream()
  }

  /** Open the live list while the Host serves the settings section, and close it when it stops. */
  private syncStream(): void {
    const served = this.scope.getSnapshot().status === 'ready'
    if (served && this.stream === undefined) this.openStream()
    else if (!served && this.stream !== undefined) this.stopStream()
  }

  /** Open one supervised generation of the live list. */
  private openStream(): void {
    this.stopStream()
    const generation = ++this.streamGeneration
    const stream = this.remote.$stream<readonly McpManagedServerView[]>({
      name: 'mcp servers',
      open: signal => this.remote.mcpManager.watch(signal),
      ended: () => new Error('mcp server list stream ended'),
    })
    this.stream = stream
    this.readFailed = false
    void this.consume(stream, generation)
  }

  /** Stop the live list; the rows keep their last statuses. */
  private stopStream(): void {
    const stream = this.stream
    if (stream === undefined) return
    this.stream = undefined
    this.readFailed = false
    void stream.dispose()
  }

  /**
   * Publish every list a stream delivers, and report its failure while it is still the current one.
   * @param stream - the generation being consumed.
   * @param generation - its position in the stream sequence.
   */
  private async consume(stream: McpStreamHandle<readonly McpManagedServerView[]>, generation: number): Promise<void> {
    let failed = false
    try {
      for await (const frame of stream) {
        if (this.disposed || generation !== this.streamGeneration) return
        this.views = frame.value
        this.readFailed = false
        frame.accept()
        this.publish()
      }
    } catch (_error) {
      // A stream that ended or lost its carrier keeps the last list and offers a retry.
      failed = true
    }
    // A generation the page already replaced owns neither the list nor the notice.
    if (!failed || this.disposed || generation !== this.streamGeneration) return
    this.stream = undefined
    this.readFailed = true
    this.publish()
  }

  /**
   * Write one next `servers` record, after every write already queued.
   * @param name - the row whose notice reports the outcome.
   * @param change - builds the next record from the record the Host last accepted.
   * @returns whether the Host accepted the write.
   */
  private async write(
    name: string,
    change: (servers: Readonly<Record<string, McpServerEntry>>) => Record<string, McpServerEntryWrite>,
  ): Promise<boolean> {
    let accepted: boolean
    try {
      accepted = await this.enqueue(async () => this.scope.set(SERVERS_FIELD, change(this.servers())))
    } catch (_error) {
      // A rejected transport call is a failed write like a refused one: the row
      // reports it and the editor keeps its drafts.
      accepted = false
    }
    if (accepted) this.problems.delete(name)
    else this.problems.set(name, 'write')
    this.publish()
    return accepted
  }

  /**
   * Run one row action, reporting its busy state and its failure notice.
   * @param name - the row the action belongs to.
   * @param kind - the busy state and the fallback failure notice.
   * @param run - performs the action; answers a problem key when the action failed.
   */
  private async action(
    name: string,
    kind: 'restart' | 'probe',
    run: () => Promise<McpRowProblem | undefined>,
  ): Promise<void> {
    this.problems.delete(name)
    this.busy.set(name, kind)
    this.publish()
    let problem: McpRowProblem | undefined
    try {
      problem = await run()
    } catch (_error) {
      // A rejected transport call reads as a refused action.
      problem = kind
    }
    this.busy.delete(name)
    if (problem !== undefined) this.problems.set(name, problem)
    this.publish()
  }

  /**
   * Serialize writes so each builds on the record the previous settlement published.
   * @param operation - the write to run after every earlier one.
   * @returns the operation's own result.
   */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeTail.then(operation)
    // The tail stays fulfilled, so one failed write cannot strand the queue.
    this.writeTail = run.then(() => undefined, () => undefined)
    return run
  }

  /** The accepted `servers` record, or an empty one before the first section arrives. */
  private servers(): Readonly<Record<string, McpServerEntry>> {
    return this.scope.getSnapshot().value?.servers ?? {}
  }

  /**
   * Every accepted entry as the write variant its transport names, so one
   * write replaces the record without disturbing another entry.
   * @param servers - the record the Host last accepted.
   * @returns the record as this page writes it.
   */
  private writeRecord(servers: Readonly<Record<string, McpServerEntry>>): Record<string, McpServerEntryWrite> {
    const next: Record<string, McpServerEntryWrite> = {}
    for (const [key, entry] of Object.entries(servers)) next[key] = writeOf(entry)
    return next
  }

  /** What the page renders now. */
  private projection(): McpServersState {
    const snapshot = this.scope.getSnapshot()
    const entries = snapshot.value?.servers ?? {}
    const views = new Map<string, McpManagedServerView>()
    for (const view of this.views) views.set(view.name, view)
    const names = [...new Set([...Object.keys(entries), ...views.keys()])].sort(compareNames)
    return {
      status: snapshot.status,
      writable: snapshot.writable,
      readFailed: this.readFailed,
      servers: names.map(name => this.row(name, entries[name], views.get(name))),
    }
  }

  /**
   * One row from its configured entry and its runtime view.
   * @param name - the server name.
   * @param entry - the configured entry, when the settings section holds one.
   * @param view - the runtime view, when the live list reports one.
   * @returns the row the page renders.
   */
  private row(name: string, entry: McpServerEntry | undefined, view: McpManagedServerView | undefined): McpServerRow {
    const enabled = entry?.enabled ?? true
    return {
      name,
      configured: entry !== undefined,
      runtimeOnly: view !== undefined && !view.configured && entry === undefined,
      transport: entry?.transport,
      enabled,
      entry,
      status: view === undefined
        ? (enabled ? { state: 'connecting', attempt: 0 } : { state: 'disabled' })
        : view.status,
      probe: this.probes.get(name),
      busy: this.busy.get(name),
      problem: this.problems.get(name),
    }
  }

  /** Replace the published snapshot; a disposed page publishes nothing. */
  private publish(): void {
    if (this.disposed) return
    this.store.set(this.projection())
  }
}

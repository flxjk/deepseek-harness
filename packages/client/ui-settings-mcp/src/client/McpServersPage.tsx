/**
 * The MCP servers page: one row per managed server with its transport, live
 * status, tool namespace, and controls, the add and edit dialog over one
 * entry's transport fields, and the delete confirmation. Every value and
 * callback arrives from the registration-side face; this half owns copy,
 * layout, and which dialog is open, and holds the drafts inside a dialog.
 */

import { useState } from 'react'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {
  Button, Input, Modal, SegmentedControl, Switch, Tag,
  type SegmentedControlOption, type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  draftEntry, draftOf,
  type McpDraftProblem, type McpManagedServerStatus, type McpProbeView, type McpRowProblem,
  type McpServerDraft, type McpServerEntry, type McpServerRow, type McpServersFace, type McpTransport,
} from './mcp-servers-controller.ts'
import type { McpSettingsLocaleKey } from './locales.ts'
import css from './McpServersPage.module.css'

/** Props the renderer binds for the MCP servers page. */
export type McpServersPageProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.mcp'>
  & InjectFace<McpServersFace>

type T = McpServersPageProps['t']

/** Separator between the parts of one status detail line. */
const DETAIL_SEPARATOR = ' · '

/** Dictionary names of the two transports. */
const TRANSPORT_LABELS: Record<McpTransport, McpSettingsLocaleKey> = {
  stdio: 'transportStdio',
  'streamable-http': 'transportHttp',
}

/** One editor target: the server key and the entry being replaced, if any. */
interface EditorTarget {
  /** The settings key; empty while adding. */
  name: string
  /** The configured entry, or undefined while adding. */
  entry: McpServerEntry | undefined
}

/**
 * Render the page's one-liner or its server list, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the page snapshot, and its actions.
 * @returns the one-liner, the list, or the notice for a namespace that is not ready.
 */
export function McpServersPage(props: McpServersPageProps) {
  const { t } = props
  const state = props.useMcpServers(snapshot => snapshot)
  const [editor, setEditor] = useState<EditorTarget | undefined>(undefined)
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  if (props.view === 'summary') return t('description')
  if (state.status !== 'ready') {
    return <p className={css.notice} role="status">{state.status === 'loading' ? t('loading') : t('unavailable')}</p>
  }
  const readOnly = !state.writable
  return (
    <div className={css.page}>
      <div className={css.head}>
        <p className={css.intro}>{t('description')}</p>
        <Button variant="primary" size="sm" disabled={readOnly}
          onClick={() => { setEditor({ name: '', entry: undefined }) }}>
          {t('addServer')}
        </Button>
      </div>
      {readOnly && <p className={css.notice} role="status">{t('readOnly')}</p>}
      {state.readFailed && (
        <div className={css.notice} role="status">
          <span>{t('readFailed')}</span>
          <Button variant="outline" size="sm" onClick={props.retry}>{t('retry')}</Button>
        </div>
      )}
      {state.servers.length === 0
        ? <p className={css.empty}>{t('empty')}</p>
        : (
          <ul className={css.list}>
            {state.servers.map(row => (
              <ServerRow key={row.name} t={t} row={row} readOnly={readOnly}
                onSetEnabled={props.setEnabled} onRestart={props.restart} onProbe={props.probe}
                onEdit={() => { setEditor({ name: row.name, entry: row.entry }) }}
                onRemove={() => { setRemoving(row.name) }} />
            ))}
          </ul>
        )}
      {editor !== undefined && (
        <ServerEditor t={t} target={editor} names={state.servers.map(row => row.name)} disabled={readOnly}
          onAdd={props.addServer} onUpdate={props.updateServer} onClose={() => { setEditor(undefined) }} />
      )}
      {removing !== undefined && (
        <RemoveDialog t={t} name={removing} onClose={() => { setRemoving(undefined) }}
          onConfirm={() => { props.removeServer(removing); setRemoving(undefined) }} />
      )}
    </div>
  )
}

/** One managed server: its identity, live status, and the actions it accepts. */
function ServerRow(props: {
  t: T
  row: McpServerRow
  readOnly: boolean
  onSetEnabled: McpServersFace['setEnabled']
  onRestart: McpServersFace['restart']
  onProbe: McpServersFace['probe']
  onEdit: () => void
  onRemove: () => void
}) {
  const { t, row } = props
  const badge = statusBadge(t, row.status)
  const detail = statusDetail(t, row.status)
  const namespace = `mcp__${row.name}__`
  return (
    <li className={css.row}>
      <div className={css.rowHead}>
        <span className={css.name}>{row.name}</span>
        {row.transport !== undefined && <Tag tone="outline">{t(TRANSPORT_LABELS[row.transport])}</Tag>}
        {row.runtimeOnly && <Tag tone="info">{t('runtimeOnlyTag')}</Tag>}
        <Tag tone={badge.tone}>{badge.label}</Tag>
      </div>
      <p className={css.namespace}>{t('toolNamespace', { namespace })}</p>
      {detail !== '' && <p className={css.detail}>{detail}</p>}
      {row.runtimeOnly && <p className={css.detail}>{t('runtimeOnly')}</p>}
      {row.probe !== undefined && (
        <>
          <p className={css.detail}>{probeText(t, row.probe)}</p>
          {row.probe.ok && row.probe.server !== undefined && (
            <p className={css.detail}>
              {t('probeOkServer', { name: row.probe.server.name, version: row.probe.server.version })}
            </p>
          )}
        </>
      )}
      {row.problem !== undefined && <p className={css.problem} role="status">{problemText(t, row.problem)}</p>}
      <div className={css.actions}>
        {row.configured && (
          <Switch checked={row.enabled} disabled={props.readOnly}
            label={row.enabled ? t('disableServer', { name: row.name }) : t('enableServer', { name: row.name })}
            onChange={(next) => { props.onSetEnabled(row.name, next) }} />
        )}
        <Button size="sm" variant="outline" disabled={row.busy !== undefined}
          onClick={() => { props.onProbe(row.name) }}>
          {row.busy === 'probe' ? t('probing') : t('probe')}
        </Button>
        <Button size="sm" variant="outline" disabled={row.busy !== undefined}
          onClick={() => { props.onRestart(row.name) }}>
          {row.busy === 'restart' ? t('restarting') : t('restart')}
        </Button>
        {row.configured && (
          <Button size="sm" variant="outline" disabled={props.readOnly} onClick={props.onEdit}>{t('edit')}</Button>
        )}
        {row.configured && (
          <Button size="sm" variant="ghost" disabled={props.readOnly} onClick={props.onRemove}>{t('delete')}</Button>
        )}
      </div>
    </li>
  )
}

/**
 * The add and edit dialog: the transport picker and, under it, the fields that
 * transport uses. Save is offered only while the draft is writable, and a
 * refused write stays on the dialog with the failure notice.
 */
function ServerEditor(props: {
  t: T
  target: EditorTarget
  /** Every listed server name, so a new entry cannot shadow another. */
  names: readonly string[]
  /** Whether the document refuses writes. */
  disabled: boolean
  onAdd: McpServersFace['addServer']
  onUpdate: McpServersFace['updateServer']
  onClose: () => void
}) {
  const { t } = props
  const editing = props.target.entry !== undefined
  const [draft, setDraft] = useState<McpServerDraft>(() => draftOf(props.target.name, props.target.entry))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const taken = !editing && props.names.includes(draft.name.trim())
  const outcome = draftEntry(draft, props.target.entry, taken)
  const problem = outcome.ok ? undefined : outcome.problem
  const messageFor = (kinds: readonly McpDraftProblem['kind'][]): string | undefined =>
    problem !== undefined && kinds.includes(problem.kind) ? draftProblemText(t, problem) : undefined
  const edit = (change: Partial<McpServerDraft>): void => {
    setFailed(false)
    setDraft(current => ({ ...current, ...change }))
  }
  const submit = (): void => {
    setSaving(true)
    setFailed(false)
    const settle = editing ? props.onUpdate(props.target.name, draft) : props.onAdd(draft)
    void settle.then((accepted) => {
      setSaving(false)
      if (accepted) props.onClose()
      else setFailed(true)
    })
  }
  const locked = props.disabled || saving
  return (
    <Modal open title={editing ? t('editTitle', { name: props.target.name }) : t('addTitle')} closeLabel={t('cancel')}
      onClose={props.onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={props.onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={problem !== undefined || locked} onClick={submit}>
            {saving ? t('saving') : t('save')}
          </Button>
        </>
      )}>
      <div className={css.form}>
        <TextLineField id="mcp-server-name" label={t('name')} hint={t('nameHint')} text={draft.name}
          invalid={messageFor(['nameEmpty', 'nameInvalid', 'nameTaken'])} disabled={editing || locked}
          onEdit={(text) => { edit({ name: text }) }} />
        <div className={css.field}>
          <span className={css.label}>{t('transport')}</span>
          <SegmentedControl id="mcp-server-transport" value={draft.transport} label={t('transport')}
            options={transportOptions(t)} disabled={locked} onChange={(transport) => { edit({ transport }) }} />
        </div>
        <div id={`mcp-server-transport-${draft.transport}-panel`} role="tabpanel" className={css.transportPanel}
          aria-labelledby={`mcp-server-transport-${draft.transport}`}>
          {draft.transport === 'stdio'
            ? (
              <>
                <TextLineField id="mcp-server-command" label={t('command')} hint={t('commandHint')} text={draft.command}
                  invalid={messageFor(['commandRequired'])} disabled={locked} onEdit={(text) => { edit({ command: text }) }} />
                <TextBlockField id="mcp-server-args" label={t('args')} hint={t('argsHint')} text={draft.argsText}
                  invalid={undefined} disabled={locked} onEdit={(text) => { edit({ argsText: text }) }} />
                <TextLineField id="mcp-server-cwd" label={t('cwd')} hint={t('cwdHint')} text={draft.cwd}
                  invalid={undefined} disabled={locked} onEdit={(text) => { edit({ cwd: text }) }} />
                <TextBlockField id="mcp-server-env" label={t('env')} hint={t('envHint')} text={draft.envText}
                  invalid={messageFor(['envLine'])} disabled={locked} onEdit={(text) => { edit({ envText: text }) }} />
              </>
            )
            : (
              <>
                <TextLineField id="mcp-server-url" label={t('url')} hint={t('urlHint')} text={draft.url}
                  invalid={messageFor(['urlRequired'])} disabled={locked} onEdit={(text) => { edit({ url: text }) }} />
                <TextBlockField id="mcp-server-headers" label={t('headers')} hint={t('headersHint')} text={draft.headersText}
                  invalid={messageFor(['headersLine'])} disabled={locked} onEdit={(text) => { edit({ headersText: text }) }} />
              </>
            )}
        </div>
        {failed && <p className={css.problem} role="status">{t('writeFailed')}</p>}
      </div>
    </Modal>
  )
}

/** Confirmation before one configured entry is deleted. */
function RemoveDialog(props: { t: T; name: string; onConfirm: () => void; onClose: () => void }) {
  const { t } = props
  return (
    <Modal open tone="warning" title={t('deleteTitle', { name: props.name })} closeLabel={t('cancel')}
      description={t('deleteBody')} onClose={props.onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={props.onClose}>{t('cancel')}</Button>
          <Button variant="primary" onClick={props.onConfirm}>{t('deleteConfirm')}</Button>
        </>
      )} />
  )
}

/** One single-line staged field: its label, input, and hint or message. */
function TextLineField(props: {
  id: string
  label: string
  hint: string
  text: string
  /** Message replacing the hint while the draft is unusable. */
  invalid: string | undefined
  disabled: boolean
  onEdit: (text: string) => void
}) {
  const messageId = `${props.id}-message`
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={props.id}>{props.label}</label>
      <Input id={props.id} {...(css.input === undefined ? {} : { className: css.input })}
        value={props.text} disabled={props.disabled}
        aria-invalid={props.invalid !== undefined} aria-describedby={messageId}
        onChange={(event) => { props.onEdit(event.target.value) }} />
      <p id={messageId} className={props.invalid === undefined ? css.hint : css.invalid}>
        {props.invalid ?? props.hint}
      </p>
    </div>
  )
}

/** One multi-line staged field, one entry per line. */
function TextBlockField(props: {
  id: string
  label: string
  hint: string
  text: string
  /** Message replacing the hint while the draft is unusable. */
  invalid: string | undefined
  disabled: boolean
  onEdit: (text: string) => void
}) {
  const messageId = `${props.id}-message`
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={props.id}>{props.label}</label>
      <textarea id={props.id} className={css.textarea} rows={3} value={props.text} disabled={props.disabled}
        aria-invalid={props.invalid !== undefined} aria-describedby={messageId}
        onChange={(event) => { props.onEdit(event.target.value) }} />
      <p id={messageId} className={props.invalid === undefined ? css.hint : css.invalid}>
        {props.invalid ?? props.hint}
      </p>
    </div>
  )
}

/**
 * The transport picker's entries.
 * @param t - the page's locale reader.
 * @returns both transports in display order.
 */
function transportOptions(t: T): readonly SegmentedControlOption<McpTransport>[] {
  return [
    { value: 'stdio', label: t('transportStdio') },
    { value: 'streamable-http', label: t('transportHttp') },
  ]
}

/**
 * The badge one runtime status becomes.
 * @param t - the page's locale reader.
 * @param status - the status the manager published.
 * @returns the badge copy and its tone.
 */
function statusBadge(t: T, status: McpManagedServerStatus): { label: string; tone: TagTone } {
  switch (status.state) {
    case 'connected': return { label: t('statusConnected'), tone: 'success' }
    case 'connecting': return { label: t('statusConnecting'), tone: 'warning' }
    case 'reconnecting': return { label: t('statusReconnecting'), tone: 'warning' }
    case 'waiting-credentials': return { label: t('statusWaitingCredentials'), tone: 'warning' }
    case 'closed': return { label: t('statusClosed'), tone: 'neutral' }
    case 'disabled': return { label: t('statusDisabled'), tone: 'neutral' }
    case 'failed': return { label: t('statusFailed'), tone: 'danger' }
  }
}

/**
 * The line under one status badge, empty when the badge says everything.
 * @param t - the page's locale reader.
 * @param status - the status the manager published.
 * @returns the detail line.
 */
function statusDetail(t: T, status: McpManagedServerStatus): string {
  switch (status.state) {
    case 'connected': return t('toolCount', { count: status.toolCount })
    case 'connecting': return status.attempt === 0 ? '' : t('attemptCount', { attempt: status.attempt })
    case 'reconnecting':
      return detailLines(t('reconnectProgress', { attempt: status.attempt, max: status.maxAttempts }), status.lastError)
    case 'waiting-credentials': return status.lastError
    case 'closed': return status.result.closeConfirmed ? '' : t('closeUnconfirmed')
    case 'disabled': return ''
    case 'failed':
      switch (status.reason) {
        case 'gave-up': return detailLines(t('reasonGaveUp'), status.lastError)
        case 'reconnect-disabled': return detailLines(t('reasonReconnectDisabled'), status.lastError)
        case 'unclosed-generation': return detailLines(t('reasonUnclosedGeneration'), status.lastError)
        case 'load': return detailLines(t('reasonLoad'), status.lastError)
        case 'cleanup': return detailLines(t('reasonCleanup'), status.result.cleanupError)
      }
  }
}

/**
 * Join the parts of one status detail line, dropping the ones the status does not carry.
 * @param parts - the reason and the diagnostic text.
 * @returns the joined line.
 */
function detailLines(...parts: (string | undefined)[]): string {
  return parts.filter(part => part !== undefined).join(DETAIL_SEPARATOR)
}

/**
 * The line one probe outcome becomes.
 * @param t - the page's locale reader.
 * @param probe - the outcome the page holds.
 * @returns the outcome line.
 */
function probeText(t: T, probe: McpProbeView): string {
  if (!probe.ok) {
    return t('probeFailed', {
      stage: t(probe.stage === 'connect' ? 'probeStageConnect' : 'probeStageList'),
      message: probe.message,
    })
  }
  return probe.truncated
    ? t('probeOkTruncated', { count: probe.toolCount, duration: probe.durationMs })
    : t('probeOk', { count: probe.toolCount, duration: probe.durationMs })
}

/**
 * The notice one failed row action becomes.
 * @param t - the page's locale reader.
 * @param problem - the failure the row reports.
 * @returns the notice.
 */
function problemText(t: T, problem: McpRowProblem): string {
  switch (problem) {
    case 'write': return t('writeFailed')
    case 'restart': return t('restartFailed')
    case 'probe': return t('probeRefused')
  }
}

/**
 * The editor's message for one unusable draft.
 * @param t - the page's locale reader.
 * @param problem - why the draft cannot be written.
 * @returns the message.
 */
function draftProblemText(t: T, problem: McpDraftProblem): string {
  switch (problem.kind) {
    case 'nameEmpty': return t('nameRequired')
    case 'nameInvalid': return t('nameInvalid')
    case 'nameTaken': return t('nameTaken')
    case 'commandRequired': return t('commandRequired')
    case 'urlRequired': return t('urlRequired')
    case 'envLine': return t('envInvalidLine', { line: problem.line })
    case 'headersLine': return t('headersInvalidLine', { line: problem.line })
  }
}

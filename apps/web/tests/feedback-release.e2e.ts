// Recorded model replay drives the shipped feedback UI and canonical log.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureExpandedTurnProcessAria, captureStableAria,
  compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, readPersistedEvents, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/feedback-release', import.meta.url))
// Both routes borrow the same settled turn; this manifest references its owner.
const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/feedback-command/session.v3.jsonl', import.meta.url))
const ACK_EXPECTED = join(SNAPSHOT_DIR, 'ack.expected.md')
const ACK_EXPANDED_EXPECTED = join(SNAPSHOT_DIR, 'ack-expanded.expected.md')
const MODE = webSnapshotMode()

const PROMPT = 'Reply with the single word LIGHTHOUSE and stop.'

describe.each(MODE === 'record' ? ['deepseek-official'] : ['deepseek-official', 'feedback-mock'])('web e2e: feedback recording for %s', (provider) => {
  const official = provider === 'deepseek-official'
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let sessionId: SessionId

  /** Flush the session and assert its canonical log holds exactly `count` events of `type`. */
  async function expectFeedbackRecorded(type: SessionEvent['type'], count: number): Promise<void> {
    const agent = scaffold.ctx.agents.get(sessionId)
    if (agent === undefined) throw new Error('feedback session has no active agent')
    await scaffold.ctx.sessions.flush(agent.session)
    const events = await readPersistedEvents(scaffold, sessionId)
    expect(events.filter(event => event.type === type)).toHaveLength(count)
    expect(scaffold.ctx.agents.get(sessionId)).toBe(agent)
  }

  async function selectModel(name: string): Promise<void> {
    const trigger = page.getByRole('button', { name: /^Select model, current/ })
    await trigger.click()
    await page.getByRole('menuitem', { name: /^Model\b/ }).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await expect.poll(() => trigger.getAttribute('aria-label')).toContain(name)
    // The durable projection can update the label before the selection reply closes the menu.
    await expect.poll(() => trigger.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('false')
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      replayProviders: [
        { id: 'deepseek-official', name: 'DeepSeek', models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', contextWindow: 128_000 },
        ] },
        { id: 'feedback-mock', name: 'Feedback mock', models: [
          { id: 'feedback-mock', name: 'Feedback mock', contextWindow: 128_000 },
        ] },
      ],
      // The replayed session.v3.jsonl belongs to the feedback-command scenario;
      // comparing (or refreshing) the persisted session here would rewrite
      // that shared source with this lane's feedback events. Persistence
      // assertions belong to this lane.
      compareReplaySession: false,
      ...(MODE === 'record' ? {} : { replayFixture: FIXTURE, paceMs: 5 }),
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('drives the recorded prompt to a settled turn (all modes)', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-feedback-release-drive'))
    if (MODE !== 'record') {
      // Drift guard: the shared fixture must carry exactly the drive prompt.
      expect(fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))).toEqual([PROMPT])
    }
    const input = page.locator('[data-composer-input]').first()
    await input.waitFor({ timeout: 10_000 })
    if (!official) await selectModel('Feedback mock')
    const settled = scaffold.whenTurnSettled()
    await input.fill(PROMPT)
    await input.press('Enter')
    sessionId = await settled
    const agent = scaffold.ctx.agents.get(sessionId)
    expect(agent?.session.requestHeader()?.config.provider).toBe(provider)
    // Both routes render the same composer without changing the actual request header.
    if (MODE !== 'record') {
      await selectModel('Feedback mock')
      await selectModel('DeepSeek-V4-Flash')
    }
    expect(agent?.session.requestHeader()?.config.provider).toBe(provider)
  }, 60_000)

  it.skipIf(MODE === 'record')('records feedback locally and acknowledges its session and anonymous user ids', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-feedback-release'))
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    const input = page.locator('[data-composer-input]').first()
    await input.fill('/feedback the diff view is unreadable')
    await input.press('Enter')

    await page.getByText(/Feedback recorded for session/).waitFor({ timeout: 10_000 })
    expect(await page.getByText(/Anonymous user: [0-9a-f-]+\.$/i).count()).toBe(1)
    await expectFeedbackRecorded('feedback/record', 1)

    const snapshot = await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(ACK_EXPECTED, snapshot, MODE)
    const expanded = await captureExpandedTurnProcessAria(
      page,
      '[class*="centerCol"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(ACK_EXPANDED_EXPECTED, expanded, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('persists text, ratings, notes, and retractions in the canonical session', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-feedback-release-suffix'))
    const input = page.locator('[data-composer-input]').first()
    await input.fill('/feedback the second remark')
    await input.press('Enter')
    await expect.poll(() => page.getByText(/Feedback recorded for session/).count()).toBe(2)
    await expectFeedbackRecorded('feedback/record', 2)
    const like = page.getByRole('button', { name: 'Good response' })
    await like.hover()
    await like.click()
    const dialog = page.getByRole('dialog', { name: 'Submit feedback' })
    await dialog.getByRole('button', { name: 'Instruction understanding and following', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Feedback details' }).fill('Clear and complete.')
    await dialog.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect.poll(() => dialog.count()).toBe(0)
    const rated = page.getByRole('button', { name: 'Remove rating' })
    await expect.poll(() => rated.getAttribute('aria-pressed')).toBe('true')
    await expectFeedbackRecorded('feedback/message-put', 1)
    // The second rating uses the same dialog.
    await page.getByRole('button', { name: 'Bad response' }).click()
    await dialog.getByRole('button', { name: 'Task result', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Feedback details' }).fill('Read both files before answering.')
    await dialog.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect.poll(() => dialog.count()).toBe(0)
    await expectFeedbackRecorded('feedback/message-put', 2)
    await rated.click()
    await expect.poll(() => page.getByRole('button', { name: 'Bad response' }).getAttribute('aria-pressed')).toBe('false')
    await expectFeedbackRecorded('feedback/message-delete', 1)
    const agent = scaffold.ctx.agents.get(sessionId)
    if (agent === undefined) throw new Error('feedback session has no active agent')
    await scaffold.ctx.sessions.flush(agent.session)
    const events = await readPersistedEvents(scaffold, sessionId)
    expect(events.filter(event => event.type === 'feedback/record')).toMatchObject([
      { data: { text: 'the diff view is unreadable' } },
      { data: { text: 'the second remark' } },
    ])
    expect(events.filter(event => event.type === 'feedback/message-put')).toMatchObject([
      { data: { sessionId, item: { rating: 'positive', note: 'Clear and complete.', category: 'instruction-following' } } },
      { data: { sessionId, item: { rating: 'negative', note: 'Read both files before answering.', category: 'task-result' } } },
    ])
    expect(events.filter(event => event.type === 'feedback/message-delete')).toMatchObject([{ data: { sessionId } }])
    expect(events.filter(event => event.type === 'turn/end')).toHaveLength(1)
    expect(agent.session.requestHeader()?.config.provider).toBe(provider)
  }, 60_000)

  it.skipIf(MODE === 'record')('records headerless feedback in its own session log', async () => {
    await selectModel('Feedback mock')
    await selectModel('DeepSeek-V4-Flash')
    await page.getByRole('button', { name: 'New session', exact: true }).last().click()
    const input = page.locator('[data-composer-input][contenteditable="true"][data-placeholder="Describe what you want to build, / commands, @ files or sessions"]')
    await input.waitFor({ timeout: 15_000 })
    await input.fill('/feedback Feedback before any model request.')
    await input.press('Enter')
    const findHeaderless = () => scaffold.ctx.sessions.list().find(session => session.id !== sessionId
      && session.snapshotEvents().some(event => event.type === 'feedback/record'))
    // A command-only session keeps the hero view; its durable event confirms submission.
    await expect.poll(findHeaderless, { timeout: 10_000 }).toBeDefined()
    const headerless = findHeaderless()
    if (headerless === undefined) throw new Error('headerless feedback session not found')
    expect(headerless.requestHeader()).toBeUndefined()
    await scaffold.ctx.sessions.flush(headerless)
    const events = await readPersistedEvents(scaffold, headerless.id)
    const feedback = events.find(event => event.type === 'feedback/record')!
    expect(feedback).toMatchObject({ data: { text: 'Feedback before any model request.' } })
    expect(events.some(event => event.type === 'turn/end')).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['ack.expected.md', 'ack-expanded.expected.md'])
  })
})

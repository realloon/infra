import { EventEmitter } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { extractUserText, mkId } from './responses.server'

export type Status = 'queued' | 'completed' | 'cancelled' | 'failed'

export interface Ticket {
  id: string
  created_at: number
  completed_at: number | null
  model: string
  status: Status
  instructions: string | null
  input_json: string
  input_text: string
  output_text: string | null
  previous_response_id: string | null
  metadata_json: string | null
  conversation_id: string | null
}

export interface Conversation {
  id: string
  title: string
  user_id: string | null
  created_at: number
  updated_at: number
}

export interface ConversationSummary extends Conversation {
  pending: number
}

export interface NewResponse {
  model: string
  instructions: string | null
  input_json: string
  input_text: string
  previous_response_id: string | null
  metadata_json: string | null
  conversation_id: string | null
  user_id: string | null
}

interface TicketEvent {
  type: 'new' | 'update'
  id: string
}

const DEFAULT_TIMEOUT = 10 * 60 * 1000

function titleFrom(inputJson: string, fallback: string): string {
  let text = fallback
  try {
    text = extractUserText(JSON.parse(inputJson), fallback)
  } catch {
    // keep fallback
  }
  const line = (text.trim().split('\n')[0] ?? '').trim() || '新会话'
  return line.length > 24 ? `${line.slice(0, 24)}…` : line
}

function createCarbon() {
  const db = new DatabaseSync('carbon.db')
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      instructions TEXT,
      input_json TEXT NOT NULL,
      input_text TEXT NOT NULL,
      output_text TEXT,
      previous_response_id TEXT,
      metadata_json TEXT,
      conversation_id TEXT
    )
  `)

  db.prepare(
    `UPDATE responses SET status = 'failed', completed_at = ?
     WHERE status IN ('queued', 'in_progress')`,
  ).run(Date.now())

  const insertConv = db.prepare(
    'INSERT INTO conversations (id, title, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  const getConv = db.prepare('SELECT * FROM conversations WHERE id = ?')
  const listConv = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM responses r WHERE r.conversation_id = c.id AND r.status = 'queued') AS pending
    FROM conversations c
    WHERE (? IS NULL OR c.user_id = ?)
      AND EXISTS (SELECT 1 FROM responses r WHERE r.conversation_id = c.id)
    ORDER BY c.updated_at DESC`)
  const renameConv = db.prepare('UPDATE conversations SET title = ? WHERE id = ?')
  const touchConv = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
  const deleteConvResponses = db.prepare('DELETE FROM responses WHERE conversation_id = ?')
  const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ?')

  const insertResp = db.prepare(`
    INSERT INTO responses
      (id, created_at, model, status, instructions, input_json, input_text,
       previous_response_id, metadata_json, conversation_id)
    VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`)
  const getResp = db.prepare('SELECT * FROM responses WHERE id = ?')
  const listResp = db.prepare(
    'SELECT * FROM responses WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
  )
  const latestResp = db.prepare(
    'SELECT * FROM responses WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  )
  const completeResp = db.prepare(
    `UPDATE responses SET status = 'completed', completed_at = ?, output_text = ?
     WHERE id = ? AND status = 'queued'`,
  )
  const closeResp = db.prepare(
    `UPDATE responses SET status = ?, completed_at = ?, output_text = NULL
     WHERE id = ? AND status = 'queued'`,
  )

  const emitter = new EventEmitter()
  emitter.setMaxListeners(0)
  const waiters = new Map<string, (text: string | null) => void>()
  const emit = (type: TicketEvent['type'], id: string) => emitter.emit('event', { type, id })

  function getTicket(id: string): Ticket | null {
    return (getResp.get(id) as unknown as Ticket | undefined) ?? null
  }

  function getConversation(id: string): Conversation | null {
    return (getConv.get(id) as unknown as Conversation | undefined) ?? null
  }

  function listConversations(userId?: string): ConversationSummary[] {
    const filter = userId ?? null
    return listConv.all(filter, filter) as unknown as ConversationSummary[]
  }

  function listResponses(conversationId: string): Ticket[] {
    return listResp.all(conversationId) as unknown as Ticket[]
  }

  function latestResponse(conversationId: string): Ticket | null {
    return (latestResp.get(conversationId) as unknown as Ticket | undefined) ?? null
  }

  function createConversation(title: string, userId: string | null): Conversation {
    const id = mkId('conv_')
    const at = Date.now()
    insertConv.run(id, title || '新会话', userId, at, at)
    emit('new', id)
    return getConversation(id)!
  }

  function renameConversation(id: string, title: string): boolean {
    const ok = renameConv.run(title, id).changes > 0
    if (ok) emit('update', id)
    return ok
  }

  function deleteConversation(id: string): boolean {
    deleteConvResponses.run(id)
    const ok = deleteConv.run(id).changes > 0
    if (ok) emit('update', id)
    return ok
  }

  function createResponse(input: NewResponse): Ticket {
    let conversationId = input.conversation_id
    if (conversationId && !getConversation(conversationId)) conversationId = null
    if (!conversationId && input.previous_response_id) {
      conversationId = getTicket(input.previous_response_id)?.conversation_id ?? null
    }

    if (!conversationId) {
      conversationId = createConversation(titleFrom(input.input_json, input.input_text), input.user_id).id
    } else {
      const at = Date.now()
      touchConv.run(at, conversationId)
      if (listResponses(conversationId).length === 0)
        renameConv.run(titleFrom(input.input_json, input.input_text), conversationId)
    }

    const id = mkId('resp_')
    insertResp.run(
      id,
      Date.now(),
      input.model,
      input.instructions,
      input.input_json,
      input.input_text,
      input.previous_response_id,
      input.metadata_json,
      conversationId,
    )
    emit('new', id)
    return getTicket(id)!
  }

  function resolveWaiter(id: string, text: string | null) {
    const waiter = waiters.get(id)
    if (!waiter) return
    waiters.delete(id)
    waiter(text)
  }

  function completeTicket(id: string, outputText: string): boolean {
    const ticket = getTicket(id)
    if (!ticket) return false
    if (completeResp.run(Date.now(), outputText, id).changes === 0) return false
    if (ticket.conversation_id) touchConv.run(Date.now(), ticket.conversation_id)
    resolveWaiter(id, outputText)
    emit('update', id)
    return true
  }

  function closeTicket(id: string, status: Exclude<Status, 'queued' | 'completed'>): boolean {
    if (closeResp.run(status, Date.now(), id).changes === 0) return false
    resolveWaiter(id, null)
    emit('update', id)
    return true
  }

  function waitForReply(id: string, timeoutMs = DEFAULT_TIMEOUT): Promise<string | null> {
    const ticket = getTicket(id)
    if (!ticket) return Promise.resolve(null)
    if (ticket.status === 'completed') return Promise.resolve(ticket.output_text)
    if (ticket.status !== 'queued') return Promise.resolve(null)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(id)
        closeTicket(id, 'failed')
        resolve(null)
      }, timeoutMs)
      waiters.set(id, (text) => {
        clearTimeout(timer)
        resolve(text)
      })
    })
  }

  function subscribe(listener: (event: TicketEvent) => void): () => void {
    emitter.on('event', listener)
    return () => emitter.off('event', listener)
  }

  return {
    getTicket,
    getConversation,
    listConversations,
    listResponses,
    latestResponse,
    renameConversation,
    deleteConversation,
    createResponse,
    completeTicket,
    cancelTicket: (id: string) => closeTicket(id, 'cancelled'),
    failTicket: (id: string) => closeTicket(id, 'failed'),
    waitForReply,
    subscribe,
  }
}

const globalScope = globalThis as unknown as { __carbon?: ReturnType<typeof createCarbon> }
export const carbon = (globalScope.__carbon ??= createCarbon())

import { carbon, type Ticket } from '~/lib/store.server'
import { extractSystemText, extractUserText } from '~/lib/responses.server'
import { readUid } from '~/lib/session.server'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

export interface ConversationData {
  id: string | null
  title: string | null
  instructions: string | null
  messages: ConversationMessage[]
  pendingId: string | null
}

const EMPTY: ConversationData = {
  id: null,
  title: null,
  instructions: null,
  messages: [],
  pendingId: null,
}

function userText(response: Ticket): string {
  let input: unknown
  try {
    input = JSON.parse(response.input_json)
  } catch {
    return response.input_text
  }
  return extractUserText(input, response.input_text)
}

function systemText(response: Ticket | undefined): string | null {
  if (!response) return null
  try {
    return extractSystemText(JSON.parse(response.input_json))
  } catch {
    return null
  }
}

function build(responses: Ticket[]): Omit<ConversationData, 'id' | 'title'> {
  const messages: ConversationMessage[] = []
  let pendingId: string | null = null
  for (const response of responses) {
    messages.push({ id: `${response.id}:user`, role: 'user', content: userText(response) })
    if (response.output_text !== null) {
      messages.push({ id: `${response.id}:assistant`, role: 'assistant', content: response.output_text })
    } else if (response.status === 'queued') {
      messages.push({ id: `${response.id}:assistant`, role: 'assistant', content: '', pending: true })
      pendingId = response.id
    } else {
      messages.push({
        id: `${response.id}:assistant`,
        role: 'assistant',
        content: response.status === 'cancelled' ? '（已忽略）' : '（未回复）',
      })
    }
  }
  const instructions =
    responses.find((response) => response.instructions)?.instructions ?? systemText(responses[0])
  return { messages, pendingId, instructions }
}

export function loadConversation(
  conversationId: string | undefined,
  userId: string | null | undefined,
): ConversationData {
  if (!conversationId) return EMPTY
  const conversation = carbon.getConversation(conversationId)
  if (!conversation) return EMPTY
  if (userId !== undefined && conversation.user_id !== userId) return EMPTY
  return { id: conversation.id, title: conversation.title, ...build(carbon.listResponses(conversation.id)) }
}

export async function sendMessage(request: Request, conversationId?: string) {
  const uid = await readUid(request)
  if (!uid) return { ok: false, conversationId: null }

  const form = await request.formData()
  const output = String(form.get('output') ?? '').trim()
  if (!output) return { ok: false, conversationId: null }

  const draft = {
    model: 'carbon-1',
    instructions: null,
    input_json: JSON.stringify(output),
    input_text: output,
    metadata_json: null,
    user_id: uid,
  }

  if (conversationId) {
    const conversation = carbon.getConversation(conversationId)
    if (!conversation || conversation.user_id !== uid) return { ok: false, conversationId: null }
    carbon.createResponse({
      ...draft,
      conversation_id: conversationId,
      previous_response_id: carbon.latestResponse(conversationId)?.id ?? null,
    })
    return { ok: true, conversationId: null }
  }

  const ticket = carbon.createResponse({
    ...draft,
    conversation_id: null,
    previous_response_id: null,
  })
  return { ok: true, conversationId: ticket.conversation_id }
}

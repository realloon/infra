import type { Route } from './+types/v1.responses'
import {
  CARBON_MODEL,
  buildResponse,
  estimateUsage,
  flattenInput,
  sseStream,
  type ResponseInput,
} from '~/lib/responses.server'
import { carbon, type Ticket } from '~/lib/store.server'

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

function toResponseInput(ticket: Ticket, status: string, usage: ResponseInput['usage']): ResponseInput {
  return {
    id: ticket.id,
    created_at: ticket.created_at,
    model: ticket.model,
    status,
    instructions: ticket.instructions,
    output_text: ticket.output_text,
    previous_response_id: ticket.previous_response_id,
    metadata: ticket.metadata_json ? JSON.parse(ticket.metadata_json) : null,
    usage,
  }
}

function finalize(id: string): ResponseInput {
  const ticket = carbon.getTicket(id)!
  const usage = estimateUsage(ticket.input_text, ticket.output_text ?? '')
  return toResponseInput(ticket, ticket.status, usage)
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json(
      { error: { type: 'invalid_request_error', message: 'Request body must be valid JSON.' } },
      { status: 400 },
    )
  }

  const input = body.input
  if (input == null) {
    return Response.json(
      { error: { type: 'invalid_request_error', message: "Missing required parameter: 'input'." } },
      { status: 400 },
    )
  }

  const ticket = carbon.createResponse({
    model: typeof body.model === 'string' ? body.model : CARBON_MODEL,
    instructions: typeof body.instructions === 'string' ? body.instructions : null,
    input_json: JSON.stringify(input),
    input_text: flattenInput(input),
    previous_response_id:
      typeof body.previous_response_id === 'string' ? body.previous_response_id : null,
    metadata_json: body.metadata ? JSON.stringify(body.metadata) : null,
    conversation_id: typeof body.conversation_id === 'string' ? body.conversation_id : null,
    user_id: null,
  })

  if (body.stream === true) {
    request.signal.addEventListener('abort', () => carbon.failTicket(ticket.id))
    const stream = sseStream(
      toResponseInput(ticket, 'in_progress', null),
      () => carbon.waitForReply(ticket.id),
      () => finalize(ticket.id),
      request.signal,
    )
    return new Response(stream, { headers: SSE_HEADERS })
  }

  await carbon.waitForReply(ticket.id)
  return Response.json(buildResponse(finalize(ticket.id)))
}

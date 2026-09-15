export const CARBON_MODEL = 'carbon-1'

export function mkId(prefix: string): string {
  return prefix + crypto.randomUUID().replace(/-/g, '')
}

interface Usage {
  input_tokens: number
  input_tokens_details: { cached_tokens: number }
  output_tokens: number
  output_tokens_details: { reasoning_tokens: number }
  total_tokens: number
}

export interface ResponseInput {
  id: string
  created_at: number
  model: string
  status: string
  instructions: string | null
  output_text: string | null
  previous_response_id: string | null
  metadata: Record<string, unknown> | null
  usage: Usage | null
}

export function estimateUsage(input: string, output: string): Usage {
  const input_tokens = Math.ceil(input.length / 4)
  const output_tokens = Math.ceil(output.length / 4)
  return {
    input_tokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: input_tokens + output_tokens,
  }
}

function flattenContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const text = (part as Record<string, unknown>).text
          if (typeof text === 'string') return text
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export function flattenInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (!Array.isArray(input)) return JSON.stringify(input)
  return input
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const role = record.role ?? record.type ?? 'item'
        for (const key of ['content', 'text', 'output', 'arguments'] as const) {
          const flat = flattenContent(record[key])
          if (flat) return `${role}: ${flat}`
        }
      }
      return JSON.stringify(item)
    })
    .join('\n')
}

export function extractUserText(input: unknown, fallback: string): string {
  if (!Array.isArray(input)) return fallback
  for (let i = input.length - 1; i >= 0; i -= 1) {
    const item = input[i]
    if (item && typeof item === 'object' && (item as Record<string, unknown>).role === 'user') {
      const text = flattenContent((item as Record<string, unknown>).content)
      if (text) return text
    }
  }
  return fallback
}

export function extractSystemText(input: unknown): string | null {
  if (!Array.isArray(input)) return null
  for (const item of input) {
    if (item && typeof item === 'object' && (item as Record<string, unknown>).role === 'system') {
      const text = flattenContent((item as Record<string, unknown>).content)
      if (text) return text
    }
  }
  return null
}

export function buildResponse(r: ResponseInput): Record<string, unknown> {
  const text = r.output_text
  const output: unknown[] = []
  if (r.status === 'completed' && text !== null) {
    output.push({
      type: 'message',
      id: mkId('msg_'),
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }],
    })
  }
  return {
    id: r.id,
    object: 'response',
    created_at: Math.floor(r.created_at / 1000),
    status: r.status,
    error:
      r.status === 'failed'
        ? { code: 'server_error', message: 'The carbon operator abandoned this request.' }
        : null,
    incomplete_details: null,
    instructions: r.instructions,
    max_output_tokens: null,
    model: r.model,
    output,
    output_text: text ?? '',
    parallel_tool_calls: true,
    previous_response_id: r.previous_response_id,
    reasoning: { effort: null, summary: null },
    store: true,
    temperature: 1,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: r.usage,
    user: null,
    metadata: r.metadata ?? {},
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function sseStream(
  initial: ResponseInput,
  wait: () => Promise<string | null>,
  finalize: () => ResponseInput,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const messageId = mkId('msg_')
  let sequence = 0
  let ping: ReturnType<typeof setInterval> | undefined

  const frame = (type: string, payload: Record<string, unknown>) => {
    sequence += 1
    return encoder.encode(
      `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence, ...payload })}\n\n`,
    )
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const enqueue = (chunk: Uint8Array) => {
        if (!closed) controller.enqueue(chunk)
      }
      const finish = () => {
        if (closed) return
        closed = true
        if (ping) clearInterval(ping)
        try {
          controller.close()
        } catch {
          // already closed by the client
        }
      }

      signal.addEventListener('abort', finish)
      ping = setInterval(() => enqueue(encoder.encode(': ping\n\n')), 15000)

      enqueue(frame('response.created', { response: buildResponse(initial) }))
      enqueue(frame('response.in_progress', { response: buildResponse(initial) }))

      const text = await wait()
      if (signal.aborted) return finish()

      const final = finalize()
      if (text) {
        enqueue(
          frame('response.output_item.added', {
            output_index: 0,
            item: { type: 'message', id: messageId, status: 'in_progress', role: 'assistant', content: [] },
          }),
        )
        enqueue(
          frame('response.content_part.added', {
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] },
          }),
        )
        const size = Math.max(12, Math.ceil(text.length / 60))
        for (let i = 0; i < text.length; i += size) {
          if (signal.aborted) return finish()
          enqueue(
            frame('response.output_text.delta', {
              item_id: messageId,
              output_index: 0,
              content_index: 0,
              delta: text.slice(i, i + size),
            }),
          )
          await sleep(12)
        }
        enqueue(
          frame('response.output_text.done', {
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            text,
          }),
        )
        enqueue(
          frame('response.content_part.done', {
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            part: { type: 'output_text', text, annotations: [] },
          }),
        )
        enqueue(
          frame('response.output_item.done', {
            output_index: 0,
            item: {
              type: 'message',
              id: messageId,
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text, annotations: [] }],
            },
          }),
        )
      }
      enqueue(frame('response.completed', { response: buildResponse(final) }))
      finish()
    },
  })
}

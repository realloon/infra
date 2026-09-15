import type { Route } from './+types/api.events'
import { carbon } from '~/lib/store.server'

export function loader({ request }: Route.LoaderArgs) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk))
      }
      const unsubscribe = carbon.subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`))
      const ping = setInterval(() => send(': ping\n\n'), 25000)

      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(ping)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      })

      send('data: connected\n\n')
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

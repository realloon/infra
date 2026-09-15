import type { Route } from './+types/operator'
import { ConversationView } from '~/components/conversation-view'
import { loadConversation } from '~/lib/conversation.server'
import { carbon } from '~/lib/store.server'

export function meta() {
  return [{ title: 'Carbon Infra · 操作台' }]
}

export async function loader({ params }: Route.LoaderArgs) {
  return loadConversation(params.id, undefined)
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const id = String(form.get('id') ?? '')
  if (!id) return { ok: false }

  if (form.get('intent') === 'cancel') return { ok: carbon.cancelTicket(id) }

  const output = String(form.get('output') ?? '').trim()
  if (!output) return { ok: false }
  return { ok: carbon.completeTicket(id, output) }
}

export default function Operator({ loaderData }: Route.ComponentProps) {
  return (
    <ConversationView
      mode="operator"
      data={loaderData}
      empty="carbon-1 is you."
    />
  )
}

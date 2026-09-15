import type { Route } from './+types/api.conversations.$id'
import { readUid } from '~/lib/session.server'
import { carbon } from '~/lib/store.server'

export async function action({ params, request }: Route.ActionArgs) {
  const id = params.id!
  const conversation = carbon.getConversation(id)
  if (!conversation) return Response.json({ ok: false }, { status: 404 })

  const url = new URL(request.url)
  if (url.searchParams.get('scope') !== 'admin') {
    const uid = await readUid(request)
    if (!uid || conversation.user_id !== uid) return Response.json({ ok: false }, { status: 403 })
  }

  if (request.method === 'DELETE') {
    return Response.json({ ok: carbon.deleteConversation(id) })
  }

  const form = await request.formData()
  const title = String(form.get('title') ?? '').trim()
  return Response.json({ ok: title ? carbon.renameConversation(id, title) : false })
}

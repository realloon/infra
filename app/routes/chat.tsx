import type { Route } from './+types/chat'
import { ConversationView } from '~/components/conversation-view'
import { loadConversation, sendMessage } from '~/lib/conversation.server'
import { readUid } from '~/lib/session.server'

export function meta() {
  return [{ title: 'Carbon Infra' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const uid = await readUid(request)
  return loadConversation(undefined, uid)
}

export async function action({ request }: Route.ActionArgs) {
  return sendMessage(request)
}

export default function NewChat({ loaderData }: Route.ComponentProps) {
  return <ConversationView mode="chat" data={loaderData} empty="新建一个会话，开始和碳基模型聊天。" />
}

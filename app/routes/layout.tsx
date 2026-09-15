import { useEffect, useRef, useState } from 'react'
import {
  data,
  Link,
  Outlet,
  useFetcher,
  useLocation,
  useNavigate,
  useRevalidator,
} from 'react-router'
import type { Route } from './+types/layout'
import { ensureUid } from '~/lib/session.server'
import { carbon } from '~/lib/store.server'

export async function loader({ request }: Route.LoaderArgs) {
  const isAdmin = new URL(request.url).pathname.startsWith('/operator')
  const { uid, setCookie } = await ensureUid(request)
  const payload = {
    isAdmin,
    conversations: carbon.listConversations(isAdmin ? undefined : uid),
  }
  return setCookie
    ? data(payload, { headers: { 'Set-Cookie': setCookie } })
    : payload
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const { isAdmin, conversations } = loaderData
  const location = useLocation()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const revalidate = useRef(revalidator.revalidate)
  revalidate.current = revalidator.revalidate

  useEffect(() => {
    const events = new EventSource('/api/events')
    events.onmessage = () => revalidate.current()
    return () => events.close()
  }, [])

  const homeBase = isAdmin ? '/operator' : '/'
  const linkBase = isAdmin ? '/operator' : '/chat'
  const scope = isAdmin ? '?scope=admin' : ''
  const activeId = location.pathname.split('/')[2] ?? null

  useEffect(() => {
    if (
      activeId &&
      !conversations.some(conversation => conversation.id === activeId)
    ) {
      navigate(homeBase, { replace: true })
    }
  }, [activeId, conversations, homeBase, navigate])

  const [editingId, setEditingId] = useState<string | null>(null)
  const renameFetcher = useFetcher()
  const deleteFetcher = useFetcher()

  function commitRename(id: string, title: string, original: string) {
    setEditingId(null)
    if (title && title !== original) {
      renameFetcher.submit(
        { title },
        { method: 'post', action: `/api/conversations/${id}${scope}` },
      )
    }
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="icon-[material-symbols--neurology] text-2xl text-emerald-400" />
          <h1 className="text-sm font-semibold">Carbon Infra</h1>
          {isAdmin && (
            <span className="ml-auto text-[11px] text-amber-400">操作台</span>
          )}
        </div>

        {!isAdmin && (
          <div className="px-2 pb-1">
            <Link
              to="/"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeId
                  ? 'text-zinc-300 hover:bg-zinc-900'
                  : 'bg-zinc-800 text-white'
              }`}
            >
              <span className="icon-[material-symbols--add] text-lg" />
              新会话
            </Link>
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {conversations.map(conversation => {
            const active = conversation.id === activeId
            return (
              <div
                key={conversation.id}
                className={`group relative flex items-center rounded-lg ${active ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
              >
                {editingId === conversation.id ? (
                  <input
                    autoFocus
                    defaultValue={conversation.title}
                    onBlur={event =>
                      commitRename(
                        conversation.id,
                        event.currentTarget.value.trim(),
                        conversation.title,
                      )
                    }
                    onKeyDown={event => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = conversation.title
                        event.currentTarget.blur()
                      }
                    }}
                    className="mx-1 my-1 min-w-0 flex-1 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm outline-none focus:border-emerald-500"
                  />
                ) : (
                  <Link
                    to={`${linkBase}/${conversation.id}`}
                    className="min-w-0 flex-1 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-zinc-200">
                        {conversation.title}
                      </span>
                      {conversation.pending > 0 && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      )}
                    </div>
                  </Link>
                )}
                {editingId !== conversation.id && (
                  <div
                    className={`pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-lg pl-4 pr-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 ${
                      active
                        ? 'bg-linear-to-l from-zinc-800 via-zinc-800 to-transparent'
                        : 'bg-linear-to-l from-zinc-900 via-zinc-900 to-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setEditingId(conversation.id)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <span className="icon-[material-symbols--edit] text-base" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deleteFetcher.submit(
                          {},
                          {
                            method: 'delete',
                            action: `/api/conversations/${conversation.id}${scope}`,
                          },
                        )
                      }
                      className="p-1.5 text-zinc-500 hover:text-red-400"
                    >
                      <span className="icon-[material-symbols--delete] text-base" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-zinc-800 p-2">
          <Link
            to="/guide"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300"
          >
            <span className="icon-[material-symbols--api] text-base" />
            接入文档
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

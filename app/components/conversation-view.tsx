import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFetcher, useNavigate } from 'react-router'
import type {
  ConversationData,
  ConversationMessage,
} from '~/lib/conversation.server'

function Thinking() {
  return <span className="thinking text-sm font-medium">Thinking</span>
}

function Bubble({
  message,
  mine,
}: {
  message: ConversationMessage
  mine: boolean
}) {
  const content = message.pending ? <Thinking /> : message.content
  if (!mine) {
    return (
      <div className="whitespace-pre-wrap text-base leading-relaxed text-zinc-100">
        {content}
      </div>
    )
  }
  return (
    <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-zinc-800 px-3 py-1 text-base leading-relaxed text-zinc-100">
        {content}
      </div>
    </div>
  )
}

function Instructions({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen(value => !value)}
      className="block w-full cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left"
    >
      <div className="flex items-center gap-1 text-xs text-zinc-500">
        instructions
        <span
          className={`icon-[material-symbols--expand-more] text-base transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>
      <div
        className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400 ${
          open ? '' : 'max-h-24 overflow-hidden'
        }`}
      >
        {text}
      </div>
    </button>
  )
}

function isMultiline(element: HTMLTextAreaElement) {
  const style = getComputedStyle(element)
  const oneLine =
    parseFloat(style.lineHeight) +
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom)
  return element.scrollHeight > oneLine + 1
}

export function ConversationView({
  mode,
  data,
  empty,
}: {
  mode: 'chat' | 'operator'
  data: ConversationData
  empty: ReactNode
}) {
  const fetcher = useFetcher()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [multiline, setMultiline] = useState(false)
  const mine = mode === 'chat' ? 'user' : 'assistant'
  const draft = mode === 'chat' && !data.id

  const createdId = (
    fetcher.data as { conversationId?: string | null } | undefined
  )?.conversationId
  useEffect(() => {
    if (fetcher.state === 'idle' && createdId) navigate(`/chat/${createdId}`)
  }, [fetcher.state, createdId, navigate])

  if (mode === 'operator' && !data.id) {
    return (
      <div className="grid h-full place-items-center px-6 text-sm text-zinc-600">
        {empty}
      </div>
    )
  }

  const canSend = mode === 'chat' ? !data.pendingId : Boolean(data.pendingId)
  const messages =
    mode === 'operator'
      ? data.messages.filter(message => !message.pending)
      : data.messages

  function submit() {
    const textarea = inputRef.current
    const value = textarea?.value.trim() ?? ''
    if (!value || !canSend) return
    textarea!.value = ''
    setMultiline(false)
    fetcher.submit(
      mode === 'chat'
        ? { intent: 'send', output: value }
        : { intent: 'reply', id: data.pendingId!, output: value },
      { method: 'post' },
    )
  }

  const composer = (
    <div className="mx-auto w-full max-w-2xl">
      {mode === 'operator' && data.pendingId && (
        <div className="mb-2 text-right">
          <button
            type="button"
            onClick={() =>
              fetcher.submit(
                { intent: 'cancel', id: data.pendingId! },
                { method: 'post' },
              )
            }
            className="text-xs text-zinc-500 transition hover:text-red-400"
          >
            忽略这条请求
          </button>
        </div>
      )}
      <div
        className={`flex border border-zinc-700 bg-zinc-900 transition ${
          canSend ? 'focus-within:border-emerald-500' : 'opacity-50'
        } ${
          multiline
            ? 'flex-col items-stretch gap-1.5 rounded-2xl p-2 pl-4'
            : 'items-end gap-1.5 rounded-full p-1.5 pl-4'
        }`}
      >
        <textarea
          ref={inputRef}
          rows={1}
          disabled={!canSend}
          onInput={event => setMultiline(isMultiline(event.currentTarget))}
          placeholder={
            mode === 'chat'
              ? '发送消息'
              : canSend
                ? '输入回复…'
                : '没有待回复的消息'
          }
          onKeyDown={event => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
            }
          }}
          className="field-sizing-content max-h-40 w-full resize-none bg-transparent py-1 text-base leading-6 outline-none placeholder:text-zinc-500"
        />
        <div className={`flex shrink-0 items-center gap-4 ${multiline ? 'self-end' : ''}`}>
          {multiline && <span className="text-xs text-zinc-500">carbon-1</span>}
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition ${
              canSend
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'cursor-not-allowed bg-zinc-700'
            }`}
          >
            <span className="icon-[material-symbols--send] translate-x-0.25 text-lg" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {!draft && (
        <header className="flex h-14 shrink-0 items-center pr-6 pl-14 md:px-6">
          <h1 className="truncate text-base font-semibold">{data.title}</h1>
        </header>
      )}

      {draft ? (
        <div className="flex flex-1 flex-col justify-center px-6 pb-28">
          <h2 className="mb-6 text-center text-2xl font-semibold text-zinc-200">
            Carbon Infra
          </h2>
          {composer}
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
            {mode === 'operator' && data.instructions && (
              <Instructions text={data.instructions} />
            )}
            {messages.map(message => (
              <Bubble
                key={message.id}
                message={message}
                mine={message.role === mine}
              />
            ))}
          </div>
          <div className="shrink-0 px-6 pb-5 pt-2">{composer}</div>
        </>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Route } from './+types/guide'

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Carbon Infra · 接入文档' },
    {
      name: 'description',
      content: 'How to call Carbon Infra through the OpenAI Responses API.',
    },
  ]
}

const BASE_URL = 'https://infra.rimsage.com/v1'

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-zinc-500">{label}</div>
      <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-[13px] leading-relaxed text-zinc-300">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  )
}

const CURL_BASIC = `curl ${BASE_URL}/responses \\
  -H 'content-type: application/json' \\
  -d '{"model":"carbon-1", "input":"ping"}'`

const CURL_STREAM = `curl -N ${BASE_URL}/responses \\
  -H 'content-type: application/json' \\
  -d '{"model":"carbon-1", "input":"hello", "stream":true}'`

const CURL_CHAIN = `curl ${BASE_URL}/responses \\
  -H 'content-type: application/json' \\
  -d '{"model":"carbon-1", "input":"hello"}'

curl ${BASE_URL}/responses \\
  -H 'content-type: application/json' \\
  -d '{"model":"carbon-1", "input":"continue", "previous_response_id":"<response.id>"}'`

export default function Guide() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex h-14 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="icon-[material-symbols--neurology] text-2xl text-emerald-400" />
          <span className="text-sm font-semibold">Carbon Infra</span>
        </Link>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-6 pb-24 pt-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">调用 Carbon Infra API</h1>

          <p className="text-sm leading-relaxed text-zinc-400">
            Carbon Infra 使用与 OpenAI 兼容的 Responses API
            格式，通过修改配置，您可以使用 OpenAI SDK 来访问 Carbon Infra
            API，或使用与 OpenAI Responses API 兼容的软件。
          </p>

          <p className="text-sm leading-relaxed text-zinc-400">
            我们的{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
              carbon-1
            </code>{' '}
            原生多模态感知模型，具备深度上下文感知与泛化推理能力，在多项基准测试中取得前沿水平。
          </p>
        </div>

        <Section title="接入信息">
          <ul className="space-y-1.5 text-sm text-zinc-400">
            <li>
              Base URL：
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
                {BASE_URL}
              </code>
            </li>
            <li>
              API Key：
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
                sk-carbon-for-everyone
              </code>
            </li>
            <li>
              Model：
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
                carbon-1
              </code>
            </li>
          </ul>
        </Section>

        <Section title="快速开始">
          <Code label="curl">{CURL_BASIC}</Code>
        </Section>

        <Section title="流式输出">
          <p className="text-sm text-zinc-400">
            设置{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
              stream: true
            </code>{' '}
            返回 SSE 事件流。
          </p>
          <Code label="curl">{CURL_STREAM}</Code>
        </Section>

        <Section title="多轮对话">
          <p className="text-sm text-zinc-400">
            把上一次返回的{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
              response.id
            </code>{' '}
            作为{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
              previous_response_id
            </code>{' '}
            传回。
          </p>
          <Code label="curl">{CURL_CHAIN}</Code>
        </Section>

        <Section title="当前限制">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
            <li>目前仅实现 POST /v1/responses。</li>
            <li>模型请求在边缘情况下可能会无限期等待或丢失。</li>
          </ul>
        </Section>
      </main>
    </div>
  )
}

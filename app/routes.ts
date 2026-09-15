import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  layout('routes/layout.tsx', [
    index('routes/chat.tsx'),
    route('chat/:id', 'routes/conversation.tsx'),
    route('operator/:id?', 'routes/operator.tsx'),
  ]),
  route('guide', 'routes/guide.tsx'),
  route('api/conversations/:id', 'routes/api.conversations.$id.ts'),
  route('v1/responses', 'routes/v1.responses.ts'),
  route('api/events', 'routes/api.events.ts'),
] satisfies RouteConfig

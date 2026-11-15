import { withApi, readJson } from '../../../../../lib/api'
import { chat } from '../../../../../lib/chatService'

export const dynamic = 'force-dynamic'

// Chat streaming (SSE, MTS 23.2). Galat pra-pemeriksaan (validasi, 404, kuota, provider belum dikonfigurasi,
// permintaan sama sedang diproses) dikembalikan sebagai envelope JSON biasa SEBELUM stream dimulai.
// Event: message_start, content_delta, tool_start, tool_result, usage, error, message_complete.
export const POST = withApi(
  async ({ request, session, params, requestId }) => {
    const body = await readJson(request, 20_000)
    const svc = await chat()
    const turn = await svc.begin({
      userId: session.user.id,
      projectId: params.id,
      clientRequestId: body.clientRequestId,
      content: body.content,
      requestId
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false
        const send = (ev) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify({ requestId, ...ev })}\n\n`))
          } catch {
            closed = true // client terputus; proses agen tetap dituntaskan dan disimpan
          }
        }
        try {
          await turn.run(send, request.signal)
        } finally {
          if (!closed) {
            closed = true
            try {
              controller.close()
            } catch {
              /* sudah tertutup */
            }
          }
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no'
      }
    })
  },
  { rateLimit: { name: 'chat', windowMs: 60_000, max: 20 } }
)

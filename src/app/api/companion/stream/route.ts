import { withAuth } from '@/lib/apiRoute';
import { drainKvCompanionEvents, subscribeCompanionEvents } from '@/lib/companionHub';
import type { CompanionEvent } from '@/lib/companionSyncTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 20_000;
const KV_POLL_MS = 1_000;

function sseEncode(event: CompanionEvent | { type: 'connected' }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const technicianId = session.technicianId;
      const encoder = new TextEncoder();
      let closed = false;
      const seenIds = new Set<string>();
      let lastKvPollAt = new Date().toISOString();

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const push = (event: CompanionEvent) => {
            if (closed || seenIds.has(event.id)) return;
            seenIds.add(event.id);
            if (seenIds.size > 200) {
              const iter = seenIds.values();
              for (let i = 0; i < 50; i++) {
                const next = iter.next();
                if (next.done) break;
                seenIds.delete(next.value);
              }
            }
            controller.enqueue(encoder.encode(sseEncode(event)));
          };

          controller.enqueue(encoder.encode(sseEncode({ type: 'connected' })));

          const unsubscribe = subscribeCompanionEvents(technicianId, push);

          const heartbeat = setInterval(() => {
            if (closed) return;
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          }, HEARTBEAT_MS);

          const kvPoll = setInterval(() => {
            void drainKvCompanionEvents(technicianId, lastKvPollAt).then((events) => {
              if (closed || events.length === 0) return;
              lastKvPollAt = events[events.length - 1]!.timestamp;
              for (const event of events) push(event);
            });
          }, KV_POLL_MS);

          const close = () => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            clearInterval(kvPoll);
            unsubscribe();
            try {
              controller.close();
            } catch {
              // already closed
            }
          };

          request.signal.addEventListener('abort', close);
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    },
    { rateLimitKey: 'companion.stream', skipRateLimit: true }
  );
}
/**
 * 실시간 이벤트: Redis pub/sub → 각 API 인스턴스의 SSE 연결로 전달.
 * 가격은 보내지 않는다(클라이언트가 서버 시각 기준으로 계산). 낙찰·종료 같은 상태 변화만 보낸다.
 */
import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { redis, getRedisSub, keys } from './redis.js';
import { db } from './db.js';

export type AuctionEvent =
  | { type: 'sold'; itemId: string; winningPrice: number; wonAt: string }
  | { type: 'ended'; unsoldItemIds: string[] };

const listeners = new Map<string, Set<ServerResponse>>(); // auctionId → SSE 연결들

getRedisSub().on('message', (channel, message) => {
  const auctionId = channel.slice('auction:'.length);
  for (const res of listeners.get(auctionId) ?? []) res.write(`data: ${message}\n\n`);
});

export async function publish(auctionId: string, event: AuctionEvent) {
  await redis.publish(keys.auctionChannel(auctionId), JSON.stringify(event));
}

export async function eventRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/auctions/:id/events', async (req, reply) => {
    const auctionId = req.params.id;
    const res = reply.raw;
    reply.hijack();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');

    let set = listeners.get(auctionId);
    if (!set) {
      set = new Set();
      listeners.set(auctionId, set);
      await getRedisSub().subscribe(keys.auctionChannel(auctionId));
    }
    set.add(res);

    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.raw.on('close', async () => {
      clearInterval(ping);
      set!.delete(res);
      if (set!.size === 0) {
        listeners.delete(auctionId);
        await getRedisSub().unsubscribe(keys.auctionChannel(auctionId));
      }
    });
  });
}

/** 종료된 회차의 미낙찰 물품을 유찰 처리하고 이벤트를 보낸다 (2초마다) */
export function startUnsoldSweeper() {
  const tick = async () => {
    try {
      const rows = await db
        .updateTable('item')
        .set({ status: 'unsold' })
        .where('status', '=', 'listed')
        .where('deleted_at', 'is', null)
        .where('auction_id', 'in', (eb) =>
          eb.selectFrom('auction').select('auction_id').where('ends_at', '<=', new Date()))
        .returning(['item_id', 'auction_id'])
        .execute();
      const byAuction = new Map<string, string[]>();
      for (const r of rows) byAuction.set(r.auction_id, [...(byAuction.get(r.auction_id) ?? []), r.item_id]);
      for (const [auctionId, ids] of byAuction) await publish(auctionId, { type: 'ended', unsoldItemIds: ids });
    } catch (e) {
      console.error('unsold sweeper failed', e);
    }
  };
  return setInterval(tick, 2000);
}

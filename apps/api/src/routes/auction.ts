import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db.js';
import { CATEGORIES, isCategory } from '../config.js';
import { requireUser } from '../auth.js';
import { redis, keys } from '../redis.js';
import { priceAt } from '../price.js';
import { publish } from '../events.js';

const todaySeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

/** 물품 + 회차 + 브랜드 + 낙찰 정보 공통 select */
function itemQuery() {
  return db
    .selectFrom('item as i')
    .innerJoin('auction as a', 'a.auction_id', 'i.auction_id')
    .innerJoin('brand as b', 'b.brand_id', 'a.brand_id')
    .leftJoin('award as w', 'w.item_id', 'i.item_id')
    .where('i.deleted_at', 'is', null)
    .select([
      'i.item_id as id', 'i.name', 'i.image_url as imageUrl', 'i.category',
      'i.start_price as startPrice', 'i.min_price as minPrice', 'i.status',
      'a.auction_id as auctionId', 'a.starts_at as startsAt', 'a.ends_at as endsAt',
      'a.price_drop_interval_sec as priceDropIntervalSec',
      'b.name as brandName',
      'w.winning_price as winningPrice', 'w.won_at as wonAt', 'w.winner_user_id as winnerUserId',
    ]);
}

export async function auctionRoutes(app: FastifyInstance) {
  app.get('/time', async () => ({ now: Date.now() }));

  app.get('/categories', async () => CATEGORIES);

  /** 홈: 오늘의 경매 (로그인 불필요) */
  app.get<{ Querystring: { category?: string } }>('/auctions/today', async (req) => {
    const auction = await db
      .selectFrom('auction as a')
      .innerJoin('brand as b', 'b.brand_id', 'a.brand_id')
      .select(['a.auction_id as id', 'a.auction_date as auctionDate', 'a.starts_at as startsAt',
        'a.ends_at as endsAt', 'a.price_drop_interval_sec as priceDropIntervalSec', 'b.name as brandName'])
      .where('a.auction_date', '=', todaySeoul())
      .executeTakeFirst();
    if (!auction) return { auction: null, items: [] };

    let q = itemQuery().where('i.auction_id', '=', auction.id);
    const category = req.query.category;
    if (isCategory(category)) q = q.where('i.category', '=', category);
    const rows = await q.orderBy('i.created_at').orderBy('i.item_id').execute();
    const items = rows.map(({ winnerUserId, ...r }) => r);
    const total = await db
      .selectFrom('item')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('auction_id', '=', auction.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    return { auction, items, totalItems: Number(total.n) };
  });

  /** 햄버거 메뉴: 진행 예정 브랜드 */
  app.get('/auctions/upcoming', async () => {
    return db
      .selectFrom('auction as a')
      .innerJoin('brand as b', 'b.brand_id', 'a.brand_id')
      .select(['a.auction_id as id', 'a.auction_date as auctionDate', 'a.starts_at as startsAt', 'b.name as brandName'])
      .where('a.auction_date', '>', todaySeoul())
      .orderBy('a.auction_date')
      .limit(10)
      .execute();
  });

  /** 입찰 페이지 상세 (로그인 필요) */
  app.get<{ Params: { id: string } }>('/items/:id', { preHandler: requireUser }, async (req, reply) => {
    const row = await itemQuery().where('i.item_id', '=', req.params.id).executeTakeFirst();
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: '물품을 찾을 수 없습니다.' });
    const { winnerUserId, ...item } = row;
    return { ...item, wonByMe: winnerUserId === req.userId };
  });

  /**
   * 입찰 = 즉시 낙찰.
   * 1) Redis SET NX로 선착순 1명만 통과 (DB까지 가는 경쟁 요청 차단)
   * 2) DB: UPDATE item … WHERE status='listed' + INSERT award 를 한 문장으로 확정
   *    (Redis가 없어도 DB 제약만으로 1명만 성공)
   * 낙찰가는 클라이언트 값이 아니라 서버 시각으로 계산한다.
   */
  app.post<{ Params: { id: string } }>('/items/:id/bid', { preHandler: requireUser }, async (req, reply) => {
    const userId = req.userId!;
    const itemId = req.params.id;
    const item = await itemQuery().where('i.item_id', '=', itemId).executeTakeFirst();
    if (!item) return reply.code(404).send({ error: 'NOT_FOUND', message: '물품을 찾을 수 없습니다.' });

    const now = new Date();
    if (now < item.startsAt) return reply.code(409).send({ error: 'NOT_STARTED', message: '아직 경매가 시작되지 않았습니다.' });
    if (now >= item.endsAt) return reply.code(409).send({ error: 'ENDED', message: '경매가 종료되었습니다.' });
    if (item.status !== 'listed') return reply.code(409).send({ error: 'ALREADY_SOLD', message: '이미 낙찰된 물품입니다.' });

    const lockKey = keys.bidLock(itemId);
    const acquired = await redis.set(lockKey, userId, 'PX', 10_000, 'NX');
    if (!acquired) return reply.code(409).send({ error: 'ALREADY_SOLD', message: '다른 사용자가 먼저 낙찰받았습니다.' });

    const price = priceAt(item.startPrice, item.minPrice, item.startsAt, now, item.priceDropIntervalSec);
    try {
      const result = await sql<{ item_id: string }>`
        WITH sold AS (
          UPDATE item SET status = 'sold'
           WHERE item_id = ${itemId} AND status = 'listed' AND deleted_at IS NULL
          RETURNING item_id
        )
        INSERT INTO award (item_id, winner_user_id, winning_price, won_at)
        SELECT item_id, ${userId}, ${price}, ${now} FROM sold
        RETURNING item_id`.execute(db);

      if (result.rows.length === 0) {
        return reply.code(409).send({ error: 'ALREADY_SOLD', message: '다른 사용자가 먼저 낙찰받았습니다.' });
      }
      // 낙찰이 확정되면 잠금은 그대로 두어 이후 요청도 Redis에서 바로 거절
      await redis.pexpire(lockKey, 24 * 60 * 60 * 1000);
      await publish(item.auctionId, { type: 'sold', itemId, winningPrice: price, wonAt: now.toISOString() });
      return { itemId, winningPrice: price, wonAt: now.toISOString() };
    } catch (e) {
      await redis.del(lockKey);
      throw e;
    }
  });

  /** 내 낙찰 물품 */
  app.get('/me/wins', { preHandler: requireUser }, async (req) => {
    return db
      .selectFrom('award as w')
      .innerJoin('item as i', 'i.item_id', 'w.item_id')
      .innerJoin('auction as a', 'a.auction_id', 'i.auction_id')
      .innerJoin('brand as b', 'b.brand_id', 'a.brand_id')
      .select(['i.item_id as id', 'i.name', 'i.image_url as imageUrl', 'b.name as brandName',
        'w.winning_price as winningPrice', 'w.won_at as wonAt'])
      .where('w.winner_user_id', '=', req.userId!)
      .orderBy('w.won_at', 'desc')
      .execute();
  });
}

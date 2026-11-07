import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl);
/** pub/sub 구독 전용 연결 (구독 중인 연결은 다른 명령을 쓸 수 없음). API 서버에서만 생성 */
let sub: Redis | null = null;
export const getRedisSub = () => (sub ??= new Redis(config.redisUrl));

export const keys = {
  session: (sid: string) => `session:${sid}`,
  bidLock: (itemId: string) => `bid:lock:${itemId}`,
  auctionChannel: (auctionId: string) => `auction:${auctionId}`,
};

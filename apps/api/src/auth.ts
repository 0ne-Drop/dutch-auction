import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { redis, keys } from './redis.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'sid';

/** scrypt$<salt hex>$<hash hex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export async function createSession(userId: string): Promise<string> {
  const sid = randomBytes(32).toString('base64url');
  await redis.set(keys.session(sid), userId, 'EX', config.sessionTtlSec);
  return sid;
}

export async function destroySession(sid: string | undefined) {
  if (sid) await redis.del(keys.session(sid));
}

export async function getSessionUserId(req: FastifyRequest): Promise<string | null> {
  const sid = req.cookies[SESSION_COOKIE];
  if (!sid) return null;
  return redis.get(keys.session(sid));
}

/** 로그인 필수 라우트용 preHandler */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const userId = await getSessionUserId(req);
  if (!userId) return reply.code(401).send({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  req.userId = userId;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.cookieSecure,
  maxAge: config.sessionTtlSec,
};

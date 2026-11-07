import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../db.js';
import {
  SESSION_COOKIE, cookieOptions, createSession, destroySession,
  getSessionUserId, hashPassword, verifyPassword,
} from '../auth.js';

const LOGIN_ID_RE = /^[A-Za-z0-9]{4,20}$/;

async function loginIdTaken(loginId: string) {
  const row = await db
    .selectFrom('app_user')
    .select('app_user_id')
    .where(sql<string>`lower(login_id)`, '=', loginId.toLowerCase())
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Boolean(row);
}

export async function authRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { loginId?: string } }>('/auth/check-id', async (req, reply) => {
    const loginId = req.query.loginId ?? '';
    if (!LOGIN_ID_RE.test(loginId)) {
      return reply.code(400).send({ error: 'INVALID_LOGIN_ID', message: '아이디는 영문·숫자 4~20자입니다.' });
    }
    return { available: !(await loginIdTaken(loginId)) };
  });

  app.post<{ Body: { loginId?: string; password?: string } }>('/auth/signup', async (req, reply) => {
    const { loginId = '', password = '' } = req.body ?? {};
    if (!LOGIN_ID_RE.test(loginId)) {
      return reply.code(400).send({ error: 'INVALID_LOGIN_ID', message: '아이디는 영문·숫자 4~20자입니다.' });
    }
    if (password.length < 8 || password.length > 72) {
      return reply.code(400).send({ error: 'INVALID_PASSWORD', message: '비밀번호는 8자 이상이어야 합니다.' });
    }
    if (await loginIdTaken(loginId)) {
      return reply.code(409).send({ error: 'LOGIN_ID_TAKEN', message: '이미 사용 중인 아이디입니다.' });
    }
    try {
      await db
        .insertInto('app_user')
        .values({ app_user_id: uuidv7(), login_id: loginId, password_hash: await hashPassword(password) })
        .execute();
    } catch (e: any) {
      if (e?.code === '23505') {
        return reply.code(409).send({ error: 'LOGIN_ID_TAKEN', message: '이미 사용 중인 아이디입니다.' });
      }
      throw e;
    }
    return reply.code(201).send({ ok: true });
  });

  app.post<{ Body: { loginId?: string; password?: string } }>('/auth/login', async (req, reply) => {
    const { loginId = '', password = '' } = req.body ?? {};
    const user = await db
      .selectFrom('app_user')
      .select(['app_user_id', 'login_id', 'password_hash'])
      .where(sql<string>`lower(login_id)`, '=', loginId.toLowerCase())
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    const sid = await createSession(user.app_user_id);
    reply.setCookie(SESSION_COOKIE, sid, cookieOptions);
    return { loginId: user.login_id };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    const userId = await getSessionUserId(req);
    if (!userId) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const user = await db
      .selectFrom('app_user')
      .select(['app_user_id', 'login_id'])
      .where('app_user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return { userId: user.app_user_id, loginId: user.login_id };
  });
}

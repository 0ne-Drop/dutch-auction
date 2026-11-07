import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { auctionRoutes } from './routes/auction.js';
import { eventRoutes, startUnsoldSweeper } from './events.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(cookie);
await app.register(
  async (api) => {
    await api.register(authRoutes);
    await api.register(auctionRoutes);
    await api.register(eventRoutes);
  },
  { prefix: '/api' },
);

app.setErrorHandler((err: { statusCode?: number }, req, reply) => {
  req.log.error(err);
  reply.code(err.statusCode ?? 500).send({ error: 'SERVER_ERROR', message: '일시적인 오류가 발생했습니다.' });
});

startUnsoldSweeper();
await app.listen({ port: config.port, host: '0.0.0.0' });

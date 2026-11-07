/**
 * 스키마 초기화: 기존 테이블을 지우고 db/schema.sql을 적용한다. (개발용)
 *   npm run db:init
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../db.js';

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../db/schema.sql');

const client = await pool.connect();
try {
  await client.query(`
    DROP TABLE IF EXISTS award, item, auction, app_user, brand CASCADE;
    DROP FUNCTION IF EXISTS award_validate, item_sold_requires_award CASCADE;
  `);
  await client.query(await readFile(schemaPath, 'utf8'));
  console.log('schema applied:', schemaPath);
} finally {
  client.release();
  await pool.end();
}

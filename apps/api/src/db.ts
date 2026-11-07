import { Kysely, PostgresDialect, type Generated, type ColumnType } from 'kysely';
import pg from 'pg';
import { config } from './config.js';

// numeric(12,0) → JS number (원 단위 정수, 최대 1조 미만이라 안전)
pg.types.setTypeParser(1700, (v) => Number(v));
// date → 'YYYY-MM-DD' 문자열 그대로
pg.types.setTypeParser(1082, (v) => v);

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface Database {
  brand: { brand_id: string; name: string; created_at: Generated<Timestamp> };
  auction: {
    auction_id: string;
    brand_id: string;
    auction_date: string;
    starts_at: Timestamp;
    ends_at: Timestamp;
    price_drop_interval_sec: number;
    created_at: Generated<Timestamp>;
  };
  app_user: {
    app_user_id: string;
    login_id: string;
    password_hash: string;
    created_at: Generated<Timestamp>;
    deleted_at: Timestamp | null;
  };
  item: {
    item_id: string;
    auction_id: string;
    name: string;
    image_url: string;
    category: string;
    start_price: number;
    min_price: number;
    status: Generated<'listed' | 'sold' | 'unsold'>;
    created_at: Generated<Timestamp>;
    deleted_at: Timestamp | null;
  };
  award: {
    item_id: string;
    item_status: Generated<'sold'>;
    winner_user_id: string;
    winning_price: number;
    won_at: Timestamp;
  };
}

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

import pg from 'pg'
import { DATABASE_URL } from '../config'

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // for Heroku Postgres SSL
})

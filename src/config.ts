import dotenv from 'dotenv'

dotenv.config()

if (!process.env.DISCORD_TOKEN) {
  throw new Error('Missing environment variable DISCORD_TOKEN; aborting.')
}

if (!process.env.DISCORD_CLIENT_ID) {
  throw new Error('Missing environment variable DISCORD_CLIENT_ID; aborting.')
}

if (!process.env.DATABASE_URL) {
  console.warn(
    'Missing environment variable DATABASE_URL; giveaways and leaderboards will not work.'
  )
}

export const BOT_COLOR = '#ac61ff'
export const DATABASE_URL = process.env.DATABASE_URL
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
export const DISCORD_SERVER_ID = '1239215561649426453'
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN
export const FAQ_FORUM_NAME = '❓│faq-guide'
export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_PROD = process.env.NODE_ENV === 'production'
export const TEST_SERVER_ID = process.env.TEST_SERVER_ID

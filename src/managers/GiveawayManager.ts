import type { Client } from 'discord.js'
import { type Giveaway, type GiveawayData, GiveawaysManager } from 'discord-giveaways'
import { DiscordManager } from './DiscordManager'
import { LogManager } from './LogManager'

const logger = new LogManager('GiveawayManager')

export const GiveawayManagerWithOwnDatabase = class extends GiveawaysManager {
  async getAllGiveaways() {
    logger.log('info', 'Fetching all giveaways from the database')

    const { Database, Discord } = this.client.managers
    const environment = Discord.IS_DEV ? 'DEV' : 'PROD'

    const rows = await Database.db
      .selectFrom('giveaways')
      .select('data')
      .where('environment', '=', environment)
      .execute()

    // It seems that the `discord-giveaways` module uses the `Giveaway` and `GiveawayData` types
    // interchangeably. Upserting is done with the latter while reading is done with the former —
    // which doesn’t make sense but here we are. The consensus seems to be that the database should
    // store only the data for each giveaway, but this method somehow expects full Giveaways back.
    return rows.map(row => row.data as unknown as Giveaway)
  }

  async saveGiveaway(messageId: string, giveawayData: GiveawayData) {
    logger.log('info', 'Saving a giveaway in the database', {
      channelId: giveawayData.channelId,
      guildId: giveawayData.guildId,
      messageId,
    })

    const { Database, Discord } = this.client.managers
    const environment = Discord.IS_DEV ? 'DEV' : 'PROD'

    const result = await Database.db
      .insertInto('giveaways')
      .values({ data: giveawayData, environment, id: messageId })
      .executeTakeFirst()

    return Boolean(result.insertId)
  }

  async editGiveaway(messageId: string, giveawayData: GiveawayData) {
    logger.log('info', 'Editing a giveaway from the database', {
      giveawayData,
      messageId,
    })

    const { Database } = this.client.managers

    const result = await Database.db
      .updateTable('giveaways')
      .set({ data: giveawayData })
      .where('id', '=', messageId)
      .executeTakeFirst()

    return result.numUpdatedRows > 0
  }

  async deleteGiveaway(messageId: string) {
    logger.log('info', 'Deleting a giveaway from the database', { messageId })

    const { Database } = this.client.managers

    const result = await Database.db
      .deleteFrom('giveaways')
      .where('id', '=', messageId)
      .executeTakeFirst()

    return result.numDeletedRows > 0
  }
}

export const initGiveawayManager = (client: Client) => {
  const { Discord } = client.managers
  // Unless it’s run in the mod channels (for testing purposes), prevent moderators from winning
  // a giveaway.
  const BOT_TESTING_CHANNELS = ['1373605591766925412', '1262282620268576809']

  const manager = new GiveawayManagerWithOwnDatabase(client, {
    default: {
      botsCanWin: false,
      embedColor: DiscordManager.BOT_COLOR,
      embedColorEnd: DiscordManager.BOT_COLOR,
      exemptMembers: (member, { channelId }) => {
        if (BOT_TESTING_CHANNELS.includes(channelId)) return false
        return Boolean(member.roles.cache.find(role => role.name === 'Community Mod'))
      },
      reaction: '🎉',
    },
  })

  manager.on('giveawayReactionAdded', (giveaway, member) => {
    if (Discord.shouldIgnoreInteraction(giveaway)) return

    logger.log('info', 'User entered giveaway', {
      messageId: giveaway.messageId,
      userId: member.user.id,
    })
  })

  manager.on('giveawayReactionRemoved', (giveaway, member) => {
    if (Discord.shouldIgnoreInteraction(giveaway)) return

    logger.log('info', 'User left giveaway', {
      messageId: giveaway.messageId,
      userId: member.user.id,
    })
  })

  manager.on('giveawayRerolled', (giveaway, winners) => {
    if (Discord.shouldIgnoreInteraction(giveaway)) return

    logger.log('info', 'Giveaway rerolled', {
      messageId: giveaway.messageId,
      winners: winners.map(winner => winner.id),
    })
  })

  manager.on('giveawayEnded', (giveaway, winners) => {
    if (Discord.shouldIgnoreInteraction(giveaway)) return

    logger.log('info', 'Giveaway ended', {
      messageId: giveaway.messageId,
      winners: winners.map(winner => winner.id),
    })
  })

  manager.on('giveawayDeleted', giveaway => {
    if (Discord.shouldIgnoreInteraction(giveaway)) return

    logger.log('info', 'Giveaway deleted', {
      messageId: giveaway.messageId,
    })
  })

  return manager
}

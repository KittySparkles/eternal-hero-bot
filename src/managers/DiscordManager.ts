import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type User,
  type Client,
  type Message,
  type PartialMessage,
  userMention,
  channelMention,
  type GuildBasedChannel,
  type OmitPartialGroupDMChannel,
  Routes,
  REST,
  type ColorResolvable,
} from 'discord.js'
import { diffWords } from 'diff'
import Bottleneck from 'bottleneck'

import type { ResolvedThread } from './FAQManager'
import { logger } from '../utils/logger'
import { commands } from '../commands'
import type { LanguageObject } from '../constants/i18n'

export type InteractionLike = {
  client: Client
  guild?: Guild | null
  guildId: string | null
  channelId?: string
  user?: User | null
  userId?: string | null
}

export class DiscordManager {
  #clientId: string
  #rest: REST

  #alertChannelId = '1381174240660951160'
  BOT_TEST_CHANNEL_ID = '1373605591766925412'
  DISCORD_SERVER_ID = '1239215561649426453'
  KITTY_USER_ID = '368097495605182483'
  BOT_COLOR = '#ac61ff' as ColorResolvable

  #severityThreshold = logger.LOG_SEVERITIES.indexOf('info')
  #log = logger.log('DiscordManager', this.#severityThreshold)

  // This is the only manager that doesn’t expect a client because it is also
  // used outside of the runtime of the bot, such as for scripts
  constructor() {
    if (!process.env.DISCORD_CLIENT_ID) {
      throw new Error(
        'Missing environment variable DISCORD_CLIENT_ID; aborting.'
      )
    }

    this.#clientId = process.env.DISCORD_CLIENT_ID
    this.#rest = new REST({ version: '10' }).setToken(this.token)
  }

  get token() {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('Missing environment variable DISCORD_TOKEN; aborting.')
    }

    return process.env.DISCORD_TOKEN
  }

  get TEST_SERVER_ID() {
    return process.env.TEST_SERVER_ID
  }

  get IS_DEV() {
    return process.env.NODE_ENV === 'development'
  }

  get IS_PROD() {
    return process.env.NODE_ENV === 'production'
  }

  logBotReady(client: Client<true>) {
    this.#log('info', 'Discord bot is ready and logged in', {
      tag: client.user.tag,
    })
  }

  getDiscordEditLimiter() {
    return new Bottleneck({
      reservoir: 5, // Allow 5 calls
      reservoirRefreshAmount: 5, // Refill to 5
      reservoirRefreshInterval: 5000, // Every 5 seconds
    })
  }

  async confirmThreadRetranslation(
    languageObjects: LanguageObject[],
    thread: ResolvedThread,
    message: Message<boolean>,
    oldMessage: Message<boolean> | PartialMessage
  ) {
    this.#log('info', 'Asking for translation confirmation', {
      id: thread.id,
    })

    const languageCount = languageObjects.length
    const char = message.content.length
    const numberFormatter = new Intl.NumberFormat('en-US')
    const currencyFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    })
    // The previous content may not be defined if the message is a partial. We
    // cannot refetch it, because it will fetch the latest version of the mes-
    // sage which will yield a null diff. So either we have the old content in
    // the Discord cache and we can diff, or we can’t.
    const contentDiff = oldMessage.content
      ? diffWords(oldMessage.content, message.content)
          .map(part => {
            if (part.added) return `**${part.value}**`
            if (part.removed) return `~~${part.value}~~`
            return part.value
          })
          .join('')
      : ''
    const content = [
      'You have edited a FAQ entry. Do you want to automatically translate it in all supported languages and reindex it?',
      `- Entry: _“${thread.name}”_`,
      `- Language count: ${numberFormatter.format(languageCount)} (w/o English)`,
      `- Character count: ${numberFormatter.format(char)}`,
      `- **Total cost:** ${currencyFormatter.format((20 / 1_000_000) * char * languageCount)}`,
      contentDiff.replace(/\n/g, '\n> '),
    ].join('\n')

    const row = this.confirmationComponent(
      { id: `confirm-retranslate:${thread.id}`, label: 'Yes, retranslate' },
      { id: `skip-retranslate:${thread.id}`, label: 'No, skip' }
    )

    await message.author.send({ content, components: [row] })
  }

  createEmbed(withThumbnail = true) {
    const embed = new EmbedBuilder().setColor(this.BOT_COLOR).setTimestamp()

    if (withThumbnail)
      embed.setThumbnail('https://ehmb.netlify.app/eh_icon.png')

    return embed
  }

  shouldIgnoreInteraction(interaction: {
    guildId: string | null
  }) {
    // The bot is meant to be used in a guild, so if there is no guild ID, then
    // the interaction should be ignored.
    if (!interaction.guildId) return

    // Prevent the production bot from answering in the test server, and the test
    // bot from answering in any other server than the test one
    if (this.IS_PROD && interaction.guildId === this.TEST_SERVER_ID) return true
    if (this.IS_DEV && interaction.guildId !== this.TEST_SERVER_ID) return true
    return false
  }

  async sendInteractionAlert(interaction: InteractionLike, message: string) {
    const userId = interaction.user?.id ?? interaction.userId
    const channel = await interaction.client.channels.fetch(
      this.#alertChannelId
    )
    if (!channel?.isSendable()) return
    if (interaction.guildId === this.TEST_SERVER_ID) return

    try {
      return await channel.send(
        stripIndent(`
      ${message}

      **Context:**
      - Server: ${interaction.guild?.name ?? interaction.guildId}
      - Channel: ${interaction.channelId ? channelMention(interaction.channelId) : 'unknown'}
      - User: ${userId ? userMention(userId) : 'unknown'}
    `)
      )
    } catch (error) {
      console.error(error)
    }
  }

  async getChannelFromInteraction(
    interaction: OmitPartialGroupDMChannel<Message<boolean>>
  ) {
    const { guild, channel, client } = interaction
    const cachedChannel = guild?.channels.cache.find(
      ({ id }) => id === channel.id
    )
    if (cachedChannel) return cachedChannel
    const fetchedChannel = await client.channels.fetch(channel.id)
    return fetchedChannel as GuildBasedChannel
  }

  deployCommands(guildId: string) {
    this.#log('info', 'Deploying bot commands', { guildId })
    const endpoint = Routes.applicationGuildCommands(this.#clientId, guildId)
    const body = Object.values(commands)
      .filter(
        command =>
          command.scope === 'PUBLIC' ||
          guildId === this.DISCORD_SERVER_ID ||
          guildId === this.TEST_SERVER_ID
      )
      .map(command => command.data)

    return this.#rest.put(endpoint, { body })
  }

  deployCommand(guildId: string, commandName: string) {
    this.#log('info', 'Deploying bot command', { guildId, commandName })
    const endpoint = Routes.applicationGuildCommands(this.#clientId, guildId)
    const [body] = Object.values(commands)
      .filter(command => command.data.name === commandName)
      .map(command => command.data)
    return this.#rest.post(endpoint, { body })
  }

  deleteCommands(guildId: string) {
    this.#log('info', 'Deleting bot commands for guild', { guildId })
    const endpoint = Routes.applicationGuildCommands(this.#clientId, guildId)
    return this.#rest.put(endpoint, { body: [] })
  }

  deleteCommand(guildId: string, commandId: string) {
    this.#log('info', 'Deleting bot command for guild', {
      guildId,
      commandId,
    })
    const endpoint = Routes.applicationGuildCommand(
      this.#clientId,
      guildId,
      commandId
    )
    return this.#rest.delete(endpoint)
  }

  toTimestamp(input: string | Date) {
    if (typeof input === 'string') {
      return `<t:${Math.round(new Date(input).valueOf() / 1000)}:d>`
    }

    return `<t:${Math.round(input.valueOf() / 1000)}:d>`
  }

  confirmationComponent(
    confirmBtn: {
      id: string
      label?: string
      style?: keyof typeof ButtonStyle
    },
    cancelBtn: { id: string; label?: string; style?: keyof typeof ButtonStyle }
  ) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmBtn.id)
        .setLabel(confirmBtn.label ?? 'Confirm')
        .setStyle(ButtonStyle[confirmBtn.style ?? 'Primary']),
      new ButtonBuilder()
        .setCustomId(cancelBtn.id)
        .setLabel(cancelBtn.label ?? 'Cancel')
        .setStyle(ButtonStyle[cancelBtn.style ?? 'Secondary'])
    )
  }
}

function minIndent(string: string) {
  const match = string.match(/^[ \t]*(?=\S)/gm)
  if (!match) return 0
  return match.reduce((r, a) => Math.min(r, a.length), Number.POSITIVE_INFINITY)
}

// Copied directly from the strip-indent package
function stripIndent(string: string) {
  const indent = minIndent(string)
  if (indent === 0) return string
  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm')
  return string.replace(regex, '')
}

import {
  type ThreadChannel,
  type Guild,
  Events,
  type ForumChannel,
  type Client,
  type AnyThreadChannel,
} from 'discord.js'

import { DISCORD_SERVER_ID, TEST_SERVER_ID } from '../constants/discord'
import { IS_DEV } from '../constants/config'
import { logger } from './logger'

const FAQ_FORUM_NAME = '❓│faq-guide'

export class FAQManager {
  client: Client
  guildId: string
  #threads: AnyThreadChannel[]
  #links: string[]

  constructor(client: Client) {
    this.client = client
    // Force `guildId` to `DISCORD_SERVER_ID` to test with the real FAQ, even
    // of the test server
    this.guildId = IS_DEV ? DISCORD_SERVER_ID : DISCORD_SERVER_ID
    this.#threads = []
    this.#links = []
  }

  get threads() {
    return this.#threads
  }

  get links() {
    return this.#links
  }

  async cacheThreads() {
    this.#threads = await this.fetchThreads()
    this.#links = [
      ...this.#threads.map(thread => thread.url),
      ...this.#threads.map(thread => `<#${thread.id}>`),
    ]
  }

  containsLinkLike(content: string) {
    return (
      content.includes('<#') ||
      content.includes('https://discord.com/channels/')
    )
  }

  async getGuild() {
    const { guilds } = this.client
    return guilds.cache.get(this.guildId) ?? (await guilds.fetch(this.guildId))
  }

  async fetchThreads() {
    const guild = await this.getGuild()
    const faq = this.getFAQForum(guild)
    const [activeThreadRes, archivedThreadRes] = await Promise.all([
      faq.threads.fetchActive(),
      faq.threads.fetchArchived(),
    ])

    const activeThreads = Array.from(activeThreadRes.threads.values())
    const archivedThreads = Array.from(archivedThreadRes.threads.values())
    const threads = [...activeThreads, ...archivedThreads]

    logger.info('FETCH_THREADS', {
      active: activeThreads.length,
      archived: archivedThreads.length,
      total: threads.length,
    })

    return threads
  }

  getFAQForum(guild: Guild) {
    const faq = guild.channels.cache.find(({ name }) => name === FAQ_FORUM_NAME)
    if (!faq) throw new Error('Could not find the FAQ forum.')
    return faq as ForumChannel
  }

  onThreadCreateOrDelete({ parentId, guild }: ThreadChannel) {
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id
    if (belongsToFAQ) this.cacheThreads()
  }

  onThreadUpdate(
    { parentId, guild, name }: ThreadChannel,
    { name: newName }: ThreadChannel
  ) {
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id
    if (belongsToFAQ && name !== newName) this.cacheThreads()
  }

  bindEvents() {
    this.client.once(Events.ClientReady, this.cacheThreads.bind(this))
    this.client.on(Events.ThreadCreate, this.onThreadCreateOrDelete.bind(this))
    this.client.on(Events.ThreadDelete, this.onThreadCreateOrDelete.bind(this))
    this.client.on(Events.ThreadUpdate, this.onThreadUpdate.bind(this))
  }
}

export const initFAQManager = (client: Client) => {
  const manager = new FAQManager(client)
  manager.bindEvents()
  return manager
}

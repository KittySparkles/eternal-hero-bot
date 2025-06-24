import {
  type ThreadChannel,
  type Guild,
  Events,
  ForumChannel,
  type Client,
  type AnyThreadChannel,
} from 'discord.js'

import { DISCORD_SERVER_ID, TEST_SERVER_ID } from '../constants/discord'
import { IS_DEV } from '../constants/config'
import { logger } from './logger'
import { LOCALES } from '../constants/i18n'
import type { LocalizationPair } from './crowdin'
import { cleanUpString } from './cleanUpString'

export type ResolvedThread = {
  id: string
  name: string
  createdAt: string
  content: string
  tags: string[]
  url: string
}

export class FAQManager {
  #FORUM_NAME = '❓│faq-guide'

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
    const faq = guild.channels.cache.find(
      ({ name }) => name === this.#FORUM_NAME
    )
    if (!faq) throw new Error('Could not find the FAQ forum.')
    return faq as ForumChannel
  }

  async onThreadCreate(thread: AnyThreadChannel) {
    const belongsToFAQ = thread.parentId === this.getFAQForum(thread.guild)?.id

    if (belongsToFAQ) {
      const localizationManager = this.client.localizationManager
      const searchManager = this.client.searchManager
      const resolvedThread = await this.resolveThread(thread)
      this.cacheThreads()

      const translations = await localizationManager.getProjectTranslations()

      for (const { languageCode, crowdin } of LOCALES) {
        if (!crowdin) continue
        // @TODO: remove namespaceExists check
        if (!(await searchManager.namespaceExists(languageCode))) continue

        // Build a localization context for this language
        const localizationContext: LocalizationPair[] = translations
          .map(term => ({
            id: term.id,
            source: cleanUpString(term.en),
            target: cleanUpString(term[languageCode]),
          }))
          .filter(entry => entry.source && entry.target)

        // Build a glossary for this specific entry
        const glossary = localizationManager.buildGlossaryForEntry(
          `${resolvedThread.name}\n${resolvedThread.content}`,
          localizationContext
        )

        // Translate it
        const localized = await localizationManager.translateEntry(
          resolvedThread,
          languageCode,
          glossary
        )

        // Prepare it for indexing
        const record = searchManager.prepareForIndexing({
          ...resolvedThread,
          ...localized,
        })

        // Record it
        await searchManager.indexRecords(languageCode, [record])
      }
    }
  }

  async onThreadDelete({ id, parentId, guild }: AnyThreadChannel) {
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id
    if (belongsToFAQ) {
      const searchManager = this.client.searchManager
      this.cacheThreads()

      for (const { languageCode, crowdin } of LOCALES) {
        if (!crowdin) continue
        // @TODO: remove namespaceExists check
        if (!(await searchManager.namespaceExists(languageCode))) continue
        await searchManager.index.namespace(languageCode).deleteOne(id)
      }
    }
  }

  async onThreadUpdate(
    oldThread: AnyThreadChannel,
    newThread: AnyThreadChannel
  ) {
    const { parentId, guild, name: oldName } = oldThread
    const { name: newName } = newThread
    const belongsToFAQ = parentId === this.getFAQForum(guild)?.id

    if (belongsToFAQ && oldName !== newName) {
      const localizationManager = this.client.localizationManager
      const searchManager = this.client.searchManager
      const resolvedThread = await this.resolveThread(newThread)
      this.cacheThreads()

      const translations = await localizationManager.getProjectTranslations()

      for (const { languageCode, crowdin } of LOCALES) {
        if (!crowdin) continue
        // @TODO: remove namespaceExists check
        if (!(await searchManager.namespaceExists(languageCode))) continue

        // Build a localization context for this language
        const localizationContext: LocalizationPair[] = translations
          .map(term => ({
            id: term.id,
            source: cleanUpString(term.en),
            target: cleanUpString(term[languageCode]),
          }))
          .filter(entry => entry.source && entry.target)

        // Build a glossary for this specific entry
        const glossary = localizationManager.buildGlossaryForEntry(
          `${resolvedThread.name}\n${resolvedThread.content}`,
          localizationContext
        )

        // Translate it
        const localized = await localizationManager.translateEntry(
          resolvedThread,
          languageCode,
          glossary
        )

        // Prepare it for indexing
        const record = searchManager.prepareForIndexing({
          ...resolvedThread,
          ...localized,
        })

        // Record it
        await searchManager.indexRecords(languageCode, [record])
      }
    }
  }

  getThreadTags(thread: AnyThreadChannel) {
    if (!(thread.parent instanceof ForumChannel)) {
      return []
    }

    return thread.appliedTags
      .map(
        id =>
          (thread.parent as ForumChannel).availableTags.find(pt => pt.id === id)
            ?.name ?? ''
      )
      .filter(Boolean)
  }

  async resolveThread(thread: AnyThreadChannel): Promise<ResolvedThread> {
    const firstMessage = await thread.fetchStarterMessage()

    return {
      id: thread.id,
      name: thread.name,
      createdAt: thread.createdAt?.toISOString() ?? '',
      content: firstMessage?.content ?? '',
      tags: this.getThreadTags(thread),
      url: thread.url,
    }
  }

  bindEvents() {
    this.client.once(Events.ClientReady, this.cacheThreads.bind(this))
    this.client.on(Events.ThreadCreate, this.onThreadCreate.bind(this))
    this.client.on(Events.ThreadDelete, this.onThreadDelete.bind(this))
    this.client.on(Events.ThreadUpdate, this.onThreadUpdate.bind(this))
  }
}

export const initFAQManager = (client: Client) => {
  const manager = new FAQManager(client)
  manager.bindEvents()
  return manager
}

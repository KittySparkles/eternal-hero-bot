import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  ForumChannel,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'
import { LOCALES } from '../constants/i18n'
import crowdin, { type LocalizationPair } from '../utils/crowdin'
import pMap from 'p-map'
import Bottleneck from 'bottleneck'
import { pool } from '../utils/pg'
import { DISCORD_SERVER_ID } from '../constants/discord'
import { withRetry } from '../utils/withRetry'
import { estimateTokenCount } from '../utils/estimateTokenCount'
import { cleanUpString } from '../utils/cleanUpString'

export const scope = 'OFFICIAL'

export type PineconeMetadata = {
  entry_question: string
  entry_answer: string
  entry_tags: string[]
  entry_date: string
  entry_url: string
}

export type PineconeEntry = {
  id: string
  chunk_text: string
} & PineconeMetadata

type ResolvedThread = {
  id: string
  name: string
  createdAt: string
  content: string
  tags: string[]
  url: string
}

export const data = new SlashCommandBuilder()
  .setName('indexfaq')
  .addStringOption(option =>
    option
      .setName('language')
      .setDescription('FAQ language')
      .setChoices(
        Object.values(LOCALES)
          .filter(locale => locale.crowdin)
          .map(locale => ({
            name: locale.languageName,
            value: locale.languageCode,
          }))
      )
  )
  .addStringOption(option =>
    option.setName('thread_id').setDescription('Specific thread ID to index')
  )
  .addBooleanOption(option =>
    option.setName('force').setDescription('Whether to retranslate all entries')
  )
  .setDescription('Index the FAQ in Pinecone')

const limiter = new Bottleneck({
  reservoir: 30000, // tokens per minute (adjust to your GPT model limit)
  reservoirRefreshAmount: 30000,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  minTime: 300, // at least 300ms between calls
})

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const { client, options } = interaction
  const { faqManager, localizationManager, searchManager } = client
  const threads = faqManager.threads
  const threadId = options.getString('thread_id')
  const language = options.getString('language') ?? ''
  const force = options.getBoolean('force') ?? false

  await interaction.editReply({ content: 'Fetching all FAQ content…' })
  const threadsData = await Promise.all(threads.map(faqManager.resolveThread))
  const threadsWithContent = threadsData
    .filter(entry => entry.content)
    .filter(entry => (threadId ? entry.id === threadId : true))

  await interaction.editReply({ content: 'Building the Crowdin project…' })

  const translations = await localizationManager.getProjectTranslations({
    onProjectBuildEnded: () =>
      interaction.editReply({ content: 'Downloading build artifact…' }),
  })

  const project = await crowdin.getProject()
  const crowdinLanguages = project.targetLanguages.filter(
    cl => cl.twoLettersCode === language || cl.locale === language
  )

  for (const crowdinLanguage of crowdinLanguages) {
    const { locale, twoLettersCode, name: localeName } = crowdinLanguage
    await interaction.editReply({
      content: `Indexing FAQ in ${localeName}…`,
    })

    // Build a localization context mapping English to the current language,
    // removing all terms that are empty on either side.
    const localizationContext: LocalizationPair[] = translations
      .map(term => ({
        id: term.id,
        source: cleanUpString(term.en),
        target: cleanUpString(term[twoLettersCode] ?? term[locale] ?? ''),
      }))
      .filter(entry => entry.source && entry.target)

    let completed = 0
    const total = threadsWithContent.length

    // Process entries concurrently
    await pMap(
      threadsWithContent,
      async thread => {
        // Look into the database whether we already found a translation for the
        // given thread; if we did, move on
        const cached = await getTranslation(thread.id, locale)
        if (!cached || force) {
          const glossary = localizationManager.buildGlossaryForEntry(
            `${thread.name}\n${thread.content}`,
            localizationContext
          )

          // Ask ChatGPT to translate the entry, with an exponential backoff if
          // it fails, and with a scheduler based on the estimated amount of
          // tokens (not great, but heh)
          await limiter.schedule(
            { weight: estimateTokenCount(thread, glossary) },
            () =>
              withRetry(() =>
                localizationManager.translateEntry(thread, locale, glossary)
              )
          )
        }

        // Share the progress
        completed++
        if (completed % 5 === 0 || completed === total || completed === 1) {
          await interaction.editReply({
            content: `Translated ${completed}/${total} entries for ${localeName}…`,
          })
        }
      },
      { concurrency: 4 }
    )

    // Once all translated, get all the translations out of the database,
    // reshape them up and record them
    const rows = await getAllTranslationsForLanguage(locale)
    const localeRecords = rows.map(row => {
      const ogThread = threadsData.find(t => t.id === row.thread_id)
      return searchManager.prepareForIndexing({
        id: row.thread_id,
        name: row.translated_title,
        content: row.translated_content,
        createdAt: ogThread?.createdAt ?? new Date().toISOString(),
        tags: ogThread?.tags ?? [],
        url:
          ogThread?.url ??
          `https://discord.com/channels/${DISCORD_SERVER_ID}/${row.thread_id}`,
      })
    })
    const count = await searchManager.indexRecords(
      twoLettersCode,
      localeRecords
    )

    await interaction.editReply({
      content: `Indexed ${count} records in ${localeName}.`,
    })
  }

  if (!language || language === 'en') {
    await interaction.editReply({ content: 'Dealing with English…' })
    const records: PineconeEntry[] = threadsData
      .filter(entry => entry.content)
      .map(searchManager.prepareForIndexing)
    const count = await searchManager.indexRecords('en', records)

    await interaction.editReply({
      content: `Indexed ${count} records in English.`,
    })
  }

  return interaction.editReply({
    content: 'All done.',
  })
}

export async function getTranslation(threadId: string, language: string) {
  const res = await pool.query(
    `SELECT translated_title, translated_content
     FROM faq_translations
     WHERE thread_id = $1 AND language = $2`,
    [threadId, language]
  )
  return res.rowCount !== null && res.rowCount > 0 ? res.rows[0] : null
}

export async function saveTranslation(
  threadId: string,
  language: string,
  translated: { name: string; content: string }
) {
  await pool.query(
    `INSERT INTO faq_translations (thread_id, language, translated_title, translated_content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (thread_id, language)
     DO UPDATE SET translated_title = $3, translated_content = $4, translated_at = now()`,
    [threadId, language, translated.name, translated.content]
  )
}

export async function getAllTranslationsForLanguage(language: string) {
  const res = await pool.query(
    `SELECT thread_id, translated_title, translated_content
     FROM faq_translations
     WHERE language = $1`,
    [language]
  )
  return res.rows as {
    thread_id: string
    translated_title: string
    translated_content: string
  }[]
}

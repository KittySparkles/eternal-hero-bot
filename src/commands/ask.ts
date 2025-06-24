import {
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import type { Index } from '@pinecone-database/pinecone'

import { logger } from '../utils/logger'
import type { PineconeMetadata } from './indexfaq'
import crowdin from '../utils/crowdin'
import { LOCALES } from '../constants/i18n'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('ask')
  .addStringOption(option =>
    option
      .setName('question')
      .setDescription('Question to ask the FAQ')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('raw')
      .setDescription('Whether to skip rephrasing by ChatGPT')
  )
  .addBooleanOption(option =>
    option
      .setName('visible')
      .setDescription('Whether it should show for everyone')
  )
  .setDescription('Ask the FAQ')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  const { options, client } = interaction
  const { searchManager, localizationManager } = client

  const query = options.getString('question', true)
  const visible = options.getBoolean('visible') ?? false
  const raw = options.getBoolean('raw') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  // Guess the language of the initial query. It it is not one of the languages
  // supported by Crowdin, it will fall back to English.
  const sourceLanguage = await localizationManager.guessLanguage(query)

  // If the source language is already indexed in Pinecone (namespace named
  // after it exists), either return the raw FAQ answer if in raw mode, or ask
  // ChatGPT to summarize if not. If ChatGPT failed to answer, return the raw
  // FAQ answer as a fallback.
  if (await searchManager.namespaceExists(sourceLanguage)) {
    return handleSearch(client, query, sourceLanguage, raw)
  }

  // If the source language is not already English, translate the query in
  // English. That’s necessary because our whole FAQ is in English, so that’s
  // the language we need to perform the search in.
  const englishQuery =
    (await localizationManager.translateToEnglish(query)) ?? query

  // Perform the search with Pinecone, and pick a single result. This could be
  // improved in the future to pick several results, and feed them all to
  // ChatGPT and ask to summarize.
  const { results } = await searchManager.search(englishQuery, 'VECTOR', {
    limit: 1,
    namespace: 'en',
  })
  const [result] = results

  // If we couldn’t get any result, stop there. If the source language is one
  // of the languages we support on Discord, use the pre-translated error
  // message, otherwise fall back to English. We could translate the English
  // message with ChatGPT but that would consume credits for something not very
  // useful.
  if (!result) {
    const locale =
      LOCALES.find(locale => locale.languageCode === sourceLanguage) ??
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      LOCALES.find(locale => locale.languageCode === 'en')!

    return interaction.editReply({ content: locale.messages.no_results })
  }

  // If the source language was not English (treated previously) and is a
  // language we support on Crowdin, compute some translation context for
  // ChatGPT by looking up the translations for terms that are associated to
  // that FAQ entry.
  const id = result._id.split('#')[1]
  const localizationContext =
    sourceLanguage !== 'UNSUPPORTED_LANGUAGE'
      ? await crowdin.getTranslationsForThread(id, 'en', sourceLanguage)
      : []

  const { entry_question: question, entry_answer: answer } =
    result.fields as PineconeMetadata

  // If in raw mode, translate the FAQ entry into the source language using the
  // provided context as help, and return it. If ChatGPT failed to answer,
  // return the raw FAQ answer as a fallback.
  if (raw) {
    const localized = await localizationManager.translateFromEnglish(
      answer,
      sourceLanguage,
      localizationContext
    )
    return interaction.editReply({ content: localized ?? answer })
  }

  // If not in raw mode, translate the FAQ entry into the source language using
  // the provided context as help, and ask ChatGPT to summarize it. If ChatGPT
  // failed to answer, return the raw FAQ answer as a fallback.
  const localizedAndRephrased =
    await localizationManager.translateFromEnglishAndSummarize(
      query,
      sourceLanguage,
      { question, answer },
      localizationContext
    )
  return interaction.editReply({ content: localizedAndRephrased ?? answer })
}

async function handleSearch(
  client: Client,
  query: string,
  language: string,
  raw: boolean
) {
  const { searchManager, localizationManager } = client
  const { results } = await searchManager.search(query, 'VECTOR', {
    limit: 1,
    namespace: language,
  })
  const [result] = results
  const { entry_question: question, entry_answer: answer } =
    result.fields as PineconeMetadata
  const context = { question, answer }
  if (raw) return answer
  const summarized = await localizationManager.summarize(query, context)
  return summarized ?? answer
}

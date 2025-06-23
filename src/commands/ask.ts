import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

import { logger } from '../utils/logger'
import type { PineconeMetadata } from './indexfaq'
import crowdin from '../utils/crowdin'

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

  const guessedLanguage = await localizationManager.guessLanguage(query)
  const englishQuery =
    guessedLanguage === 'en'
      ? query
      : await localizationManager.translateToEnglish(query)
  const { results } = await searchManager.search(englishQuery, 'VECTOR', 1)
  const [result] = results

  if (!result) {
    return interaction.editReply({
      content:
        'Unfortunately, no relevant content was found for your question. Please try rephrasing it or ask a different question.',
    })
  }

  const { entry_question: question, entry_answer: answer } =
    result.fields as PineconeMetadata
  const id = result._id.split('#')[1]
  const context = { question, answer }

  if (guessedLanguage === 'en') {
    if (raw) return interaction.editReply({ content: answer })
    const rephrased = await localizationManager.rephrase(query, context)
    return interaction.editReply({ content: rephrased ?? answer })
  }

  const localizationContext =
    guessedLanguage !== 'UNKNOWN_LANGUAGE'
      ? await crowdin.getTranslationsForThread(id, guessedLanguage)
      : []

  if (raw) {
    const localized = await localizationManager.translateFromEnglish(
      answer,
      guessedLanguage,
      localizationContext
    )
    return interaction.editReply({ content: localized ?? answer })
  }

  const localizedAndRephrased =
    await localizationManager.translateFromEnglishAndRephrase(
      query,
      guessedLanguage,
      context,
      localizationContext
    )
  return interaction.editReply({ content: localizedAndRephrased ?? answer })
}

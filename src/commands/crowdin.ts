import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import type {
  LanguagesModel,
  ResponseObject,
  StringTranslationsModel,
  TranslationStatusModel,
} from '@crowdin/crowdin-api-client'

import { logger } from '../utils/logger'
import crowdin, { CROWDIN_PROJECT_ID } from '../utils/crowdin'
import { LOCALES } from '../constants/i18n'
import { resolveThread } from './indexfaq'
import Fuse from 'fuse.js'
import fuzzysort from 'fuzzysort'
import { pool } from '../utils/pg'

export const scope = 'OFFICIAL'

export const data = new SlashCommandBuilder()
  .setName('crowdin')
  .addSubcommand(subcommand =>
    subcommand
      .setName('progress')
      .setDescription('Get the translation progress')
      .addStringOption(option =>
        option
          .setName('language')
          .setDescription('Translation language')
          .setChoices(
            Object.values(LOCALES)
              .filter(locale => locale.crowdin)
              .map(locale => ({
                name: locale.languageName,
                value: locale.languageCode,
              }))
          )
      )
      .addBooleanOption(option =>
        option
          .setName('visible')
          .setDescription('Whether it should show for everyone')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('term')
      .setDescription('Get the translations for a specific term')
      .addStringOption(option =>
        option
          .setName('key')
          .setDescription('Translation key')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('language')
          .setDescription('Translation language')
          .setChoices(
            Object.values(LOCALES)
              .filter(locale => locale.crowdin)
              .map(locale => ({
                name: locale.languageName,
                value: locale.languageCode,
              }))
          )
      )
      .addBooleanOption(option =>
        option
          .setName('visible')
          .setDescription('Whether it should show for everyone')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('index')
      .setDescription('Index FAQ entries to translation keys')
  )
  .setDescription('Interact with Crowdin')

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  const { guildId, options } = interaction
  if (!guildId) return

  if (options.getSubcommand() === 'progress') {
    return commandProgress(interaction)
  }

  if (options.getSubcommand() === 'term') {
    return commandTerm(interaction)
  }

  if (options.getSubcommand() === 'index') {
    return commandIndex(interaction)
  }
}

async function commandProgress(interaction: ChatInputCommandInteraction) {
  const { options } = interaction
  const locale = options.getString('language') ?? ''
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  const { data: projectProgress } =
    await crowdin.client.translationStatusApi.getProjectProgress(
      CROWDIN_PROJECT_ID
    )

  const header = '**Translation progress:**\n'
  const footer =
    '\n\n-# If you think your translation progress is not accurate, make sure you have saved your translations in Crowdin. Drafts do not count towards completion.'

  if (locale) {
    const languageData = projectProgress.find(
      ({ data }) => data.languageId === locale
    )

    if (!languageData) {
      return interaction.reply({
        content: `Could not find language object for \`${locale}\`.`,
        flags: MessageFlags.Ephemeral,
      })
    }

    return interaction.reply({
      content: header + formatLanguageProgress(languageData) + footer,
      flags,
    })
  }

  return interaction.reply({
    content:
      header + projectProgress.map(formatLanguageProgress).join('\n') + footer,
    flags,
  })
}

function formatLanguageProgress({
  data: { language, languageId, translationProgress, approvalProgress },
}: ResponseObject<TranslationStatusModel.LanguageProgress>) {
  return `- ${language.name} (\`${languageId}\`): translated ${translationProgress}% · approved ${approvalProgress}%`
}

async function commandTerm(interaction: ChatInputCommandInteraction) {
  const { options } = interaction
  const key = options.getString('key', true)
  const locale = options.getString('language') ?? ''
  const visible = options.getBoolean('visible') ?? false
  const flags = visible ? undefined : MessageFlags.Ephemeral

  await interaction.deferReply({ flags })

  const string = await crowdin.getStringItem(key)

  if (!string) {
    return interaction.editReply({
      content: `Could not find translation object for \`${key}\`.`,
    })
  }

  if (locale) {
    const language = await crowdin.getLanguage(locale)

    if (!language) {
      const error = `Could not find language object for \`${locale}\`.`
      return interaction.editReply({ content: error })
    }

    const [translation] = await crowdin.getStringTranslations(string.id, [
      language,
    ])

    const content = `
Translations for term \`${key}\`:
- English (original): _${string.text}_
- ${formatTranslation(translation)}`

    return interaction.editReply({ content })
  }

  const translations = await crowdin.getStringTranslationsForAllLanguages(
    string.id
  )

  const filled = translations.filter(
    ({ translation }) =>
      Boolean(translation) && translation.data.text.length > 0
  )
  const missing = translations.filter(
    ({ translation }) => !translation || translation.data.text.length === 0
  )
  const missCount = missing.length
  const content = `
Translations for term \`${key}\`:
- English (original): _${string.text}_
- ${filled.map(formatTranslation).join('\n- ')}

${
  missCount > 0
    ? `-# ${missCount} translation${missCount === 1 ? '' : 's'} missing: ${missing.map(({ language }) => language.locale).join(', ')}.`
    : ''
}
  `

  const [response, ...responses] = splitMarkdownList(content)
  await interaction.editReply({ content: response })
  for (const response of responses) {
    await interaction.followUp({ content: response, flags })
  }
}

function splitMarkdownList(message: string, maxLength = 2000): string[] {
  const lines = message.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    const candidate = current + (current ? '\n' : '') + line
    if (candidate.length > maxLength) {
      if (current) chunks.push(current)
      current = line
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function formatTranslation({
  language,
  translation,
}: {
  language: LanguagesModel.Language
  translation: ResponseObject<StringTranslationsModel.StringTranslation>
}) {
  if (!translation) {
    return `${formatLanguage(language)}:`
  }

  const { data } = translation
  const nameMapping = {
    'Alex Dvl': 'iFunz',
    'Michał Malarek': 'Exor',
    Артур: 'roartie',
    Kaiichi0: 'Kaichii',
    酷玩熊: 'Kukuch',
    김지운: '망고',
    'Gan Ying Zhi': 'Rain',
  }
  const userName = data.user.fullName
  const displayName =
    nameMapping[userName as keyof typeof nameMapping] ?? userName
  const date = new Date(data.createdAt).valueOf() / 1000

  return `${formatLanguage(language)}: _${data.text}_ (added on <t:${date}:d> by ${displayName})`
}

function formatLanguage(language: LanguagesModel.Language) {
  return `${language.name} (\`${language.locale}\`)`
}

async function commandIndex(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  await interaction.editReply({
    content: 'Fetching all strings from Crowdin…',
  })
  const allTerms = await crowdin.getProjectStrings(CROWDIN_PROJECT_ID)
  await crowdin.cacheCrowdinStrings(allTerms)

  await interaction.editReply({
    content: 'Building a thread-to-keys index…',
  })

  const matches: Array<{ thread_id: string; string_id: number }> = []

  for (const thread of interaction.client.faqManager.threads) {
    const resolvedThread = await resolveThread(thread)
    for (const term of allTerms) {
      const englishTerm = (term.text as string)
        .replace(/\{0:plural:([^|}]+)\|[^}]+\}/g, (_, s) => s)
        .replace(/<[a-z=]+>/g, '')
        .replace(/<\/[a-z=]+>/g, '')

      const match = fuzzysort.single(englishTerm, resolvedThread.content)
      if (match && match.score > 0.5)
        matches.push({
          thread_id: resolvedThread.id,
          string_id: term.id,
        })
    }
  }

  const seen = new Set<string>()
  const deduped = matches.filter(({ thread_id, string_id }) => {
    const key = `${thread_id}:${string_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (deduped.length > 0) {
    const values: string[] = []
    const params: (string | number)[] = []

    deduped.forEach(({ thread_id, string_id }, i) => {
      const offset = i * 2
      values.push(`($${offset + 1}, $${offset + 2})`)
      params.push(thread_id, string_id)
    })

    await pool.query(
      `
      INSERT INTO thread_to_crowdin_string (thread_id, string_id)
      VALUES ${values.join(', ')}
      ON CONFLICT DO NOTHING
      `,
      params
    )
  }

  return interaction.editReply({
    content: `Inserted ${deduped.length} mappings.`,
  })
}

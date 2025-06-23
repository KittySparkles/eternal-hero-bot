import type Client from '@crowdin/crowdin-api-client'
import {
  default as Crowdin,
  type SourceStringsModel,
  type LanguagesModel,
} from '@crowdin/crowdin-api-client'

import { CROWDIN_TOKEN } from '../constants/config'
import { pool } from './pg'
import { logger } from './logger'

type StringId = SourceStringsModel.String['id']

// @ts-expect-error
const client: Client = new Crowdin.default({ token: CROWDIN_TOKEN ?? '' })

// This is just a short cut to avoid querying the API just to retrieve the
// project ID. It’s a bit weird that the Crowdin URLs do not share these IDs to
// begin with to be honest.
export const CROWDIN_PROJECT_ID = 797774

async function getProjectStringTranslation(
  stringId: StringId,
  language: LanguagesModel.Language
) {
  const outcome = await client.stringTranslationsApi.listStringTranslations(
    CROWDIN_PROJECT_ID,
    stringId,
    language.id
  )

  return { language, translation: outcome.data[0] }
}

async function getProjectStrings(projectId: number) {
  const allStrings: SourceStringsModel.String[] = []
  let offset = 0
  const limit = 500 // Max limit per request

  logger.info('CROWDIN', {
    endPoint: 'sourceStringsApi.listProjectStrings',
    params: { projectId, limit },
  })

  while (true) {
    const { data } = await client.sourceStringsApi.listProjectStrings(
      projectId,
      { limit, offset }
    )

    allStrings.push(...data.map(item => item.data))
    if (data.length < limit) break
    offset += limit
  }

  return allStrings
}

async function getProject() {
  logger.info('CROWDIN', { endPoint: 'projectsGroupsApi.listProjects' })
  const projects = await client.projectsGroupsApi.listProjects()
  const project = projects.data.find(
    project => project.data.identifier === 'eternal-hero'
  )
  if (!project) throw new Error('Cannot find Crowdin project.')

  return project.data
}

async function cacheCrowdinStrings(strings: SourceStringsModel.String[]) {
  const values: string[] = []
  const params: (string | number | SourceStringsModel.PluralText)[] = []

  strings.forEach((string, i) => {
    const offset = i * 3
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`)
    params.push(string.identifier, string.id, string.text)
  })

  if (params.length > 0) {
    await pool.query(
      `
      INSERT INTO crowdin_strings (identifier, string_id, text)
      VALUES ${values.join(',')}
      ON CONFLICT (identifier) DO NOTHING
      `,
      params
    )
  }
}

export type LocalizationPair = {
  id: number
  source: string
  target: string
}

export async function getTranslationsForThread(
  threadId: string,
  sourceLocale: string,
  targetLocale: string
): Promise<LocalizationPair[]> {
  const { targetLanguages: languages } = await getProject()
  const sourceLang = languages.find(language => language.id === sourceLocale)
  const targetLang = languages.find(language => language.id === targetLocale)
  if (!sourceLang || !targetLang) return []

  // Step 1: Get all string IDs linked to this thread
  const result = await pool.query(
    'SELECT string_id FROM thread_to_crowdin_string WHERE thread_id = $1',
    [threadId]
  )
  const stringIds = result.rows.map(row => row.string_id)
  if (stringIds.length === 0) return []

  // Step 2: Get source-language strings from crowdin_strings
  const sourceRes = await pool.query(
    'SELECT string_id, text FROM crowdin_strings WHERE string_id = ANY($1::int[])',
    [stringIds]
  )
  const sourceMap = new Map<number, string>()
  for (const row of sourceRes.rows) {
    sourceMap.set(row.string_id, row.text)
  }

  // Step 3: Check for existing translations in the DB
  const cached = await pool.query(
    `SELECT string_id, translated_text FROM crowdin_translations
     WHERE string_id = ANY($1::int[]) AND language = $2`,
    [stringIds, targetLocale]
  )
  const translatedMap = new Map<number, string>()
  for (const row of cached.rows) {
    translatedMap.set(row.string_id, row.translated_text)
  }

  const missing = stringIds.filter(id => !translatedMap.has(id))

  // Step 4: Fetch + cache missing translations from Crowdin
  for (const stringId of missing) {
    const translation = await getProjectStringTranslation(stringId, targetLang)
    const translatedText = translation.translation.data.text ?? ''

    translatedMap.set(stringId, translatedText)

    await pool.query(
      `INSERT INTO crowdin_translations (string_id, language, translated_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (string_id, language)
       DO UPDATE SET translated_text = EXCLUDED.translated_text, last_synced_at = now()`,
      [stringId, targetLocale, translatedText]
    )
  }

  // Step 5: Assemble result
  return stringIds
    .map(id => {
      const source = sourceMap.get(id)
      const target = translatedMap.get(id)
      if (!source || !target) return null
      return { id, source, target }
    })
    .filter((x): x is LocalizationPair => x !== null)
}
async function getLanguage(locale: string) {
  const { targetLanguages: languages } = await getProject()
  return languages.find(language => language.id === locale)
}

async function getStringTranslationsForAllLanguages(stringId: StringId) {
  const { targetLanguages: languages } = await getProject()
  return getStringTranslations(stringId, languages)
}

async function getStringTranslations(
  stringId: StringId,
  languages: LanguagesModel.Language[]
) {
  logger.info('CROWDIN', {
    endPoint: 'stringTranslationsApi.listStringTranslations',
    params: {
      projectId: CROWDIN_PROJECT_ID,
      stringId,
      languages: languages.length,
    },
  })
  return Promise.all(
    languages.map(language => getProjectStringTranslation(stringId, language))
  )
}

async function getStringItem(identifier: string) {
  const { rows } = await pool.query(
    'SELECT string_id, text FROM crowdin_strings WHERE identifier = $1',
    [identifier]
  )

  const result: { string_id: StringId; text: string } | undefined = rows[0]
  let string: SourceStringsModel.String | undefined

  if (!result) {
    const strings = await getProjectStrings(CROWDIN_PROJECT_ID)
    await cacheCrowdinStrings(strings)

    return strings.find(string => string.identifier === identifier)
  }

  return { id: result.string_id, text: result.text }
}

export default {
  client,
  getProject,
  getStringItem,
  getStringTranslationsForAllLanguages,
  getStringTranslations,
  getLanguage,
  getProjectStrings,
  cacheCrowdinStrings,
  getTranslationsForThread,
}

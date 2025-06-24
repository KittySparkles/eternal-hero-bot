import type Client from '@crowdin/crowdin-api-client'
import {
  default as Crowdin,
  type SourceStringsModel,
  type LanguagesModel,
} from '@crowdin/crowdin-api-client'
import decompress from 'decompress'
import fetch from 'node-fetch'
import csvtojson from 'csvtojson'

import { CROWDIN_TOKEN } from '../constants/config'
import { pool } from './pg'
import { logger } from './logger'
import type { Locale } from '../constants/i18n'

type StringId = SourceStringsModel.String['id']
export type CrowdinItem = Record<Locale['languageCode'], string> & {
  Key: string
  Context?: string
}

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
  id: number | string
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

async function buildProject() {
  const {
    data: { id: buildId },
  } = await client.translationsApi.buildProject(CROWDIN_PROJECT_ID)

  return buildId
}

async function waitForBuild(buildId: number) {
  let status = 'inProgress'
  while (status === 'inProgress') {
    const { data } = await client.translationsApi.checkBuildStatus(
      CROWDIN_PROJECT_ID,
      buildId
    )
    status = data.status
    if (status === 'failed') throw new Error('Crowdin build failed')
    if (status !== 'finished') await new Promise(res => setTimeout(res, 1000))
  }
}

async function downloadBuildArtefact(
  buildId: number,
  predicate: (file: decompress.File) => boolean
) {
  const {
    data: { url },
  } = await client.translationsApi.downloadTranslations(
    CROWDIN_PROJECT_ID,
    buildId
  )

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)

  const zipBuffer = await response.buffer()
  const files = await decompress(zipBuffer)
  const jsons: CrowdinItem[][] = []

  for (const file of files) {
    if (!predicate(file)) continue
    const content = file.data.toString('utf-8')
    const json = await csvtojson().fromString(content)
    jsons.push(json)
  }

  return jsons.reduce((acc, array) => acc.concat(array), [])
}

/*
async function main() {
  
  spinner.text = `Retrieving download URL for build with ID ${buildId}`
  const {
    data: { url },
  } = await client.translationsApi.downloadTranslations(PROJECT_ID, buildId)

  // 4. Stream to file using https and fs
  spinner.text = `Downloading ZIP file from ${url}`
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(zipPath)
    https
      .get(url, (response) => {
        if (response.statusCode !== 200)
          return reject(
            new Error(`Download failed with status ${response.statusCode}`)
          )
        response.pipe(file)
        file.on("finish", () => file.close(() => resolve()))
      })
      .on("error", reject)
  })

  spinner.text = `Extracting ZIP file from ${zipPath}`
  await decompress(zipPath, "dist")

  spinner.text = "Converting CSV files to JSON"
  const jsons: CrowdinItem[][] = await Promise.all(
    csvPaths.map((path) => {
      return csvtojson().fromFile(path)
    })
  )
  spinner.text = "Reformatting JSON for further use"
  const json = jsons
    .reduce((acc, array) => acc.concat(array), [])
    .filter((object) => {
      return TRANSLATIONS_PATTERNS.some((pattern) => pattern.test(object.Key))
    })
    .map((object) => {
      const item: LocalizationItem = {
        key: object.Key,
        translations: {} as Record<Locale, string>,
      }
      for (const locale in object) {
        if (
          SUPPORTED_LOCALES.map(({ locale }) => locale).includes(
            locale as Locale
          )
        )
          item.translations[locale as Locale] = object[locale as Locale]
      }
      return item
    })

  spinner.text = `Wring JSON file at ${jsonPath}`
  await writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8")

  spinner.succeed("All done!")
}
  */

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

  buildProject,
  waitForBuild,
  downloadBuildArtefact,
}

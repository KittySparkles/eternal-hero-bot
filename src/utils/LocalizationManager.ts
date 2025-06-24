import OpenAI from 'openai'
import type { Client } from 'discord.js'
import fuzzysort from 'fuzzysort'
import type decompress from 'decompress'

import { BASE_PROMPT } from './SearchManager'
import { OPENAI_API_KEY } from '../constants/config'
import crowdin, { type LocalizationPair } from './crowdin'
import { type Locale, LOCALES } from '../constants/i18n'
import type { ResolvedThread } from './FAQManager'
import { saveTranslation } from '../commands/indexfaq'
import { cleanUpString } from './cleanUpString'

const LOCALIZATION_PROMPT = `
You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
`

const SUMMARIZE_PROMPT = `
When summarizing the FAQ answer into a more digestible and specific answer for the player, it is very important you do not take liberties with the content of the FAQ.
You must not change the meaning of the answer, and you must not add any information that is not in the FAQ.
Also be mindful about what appears like game terms, since their meaning can be subtle and matterns.
`

export function provideLocalizationContext(
  localizationContext: LocalizationPair[]
) {
  if (localizationContext.length === 0) return ''
  return localizationContext
    .filter(entry => entry.source && entry.target)
    .map(
      entry =>
        `- “${cleanUpString(entry.source)}” → ${cleanUpString(entry.target)}`
    )
    .join('\n')
}

export class LocalizationManager {
  #GPT_MODEL = 'gpt-3.5-turbo'
  openai: OpenAI
  client: Client

  constructor(client: Client) {
    if (!OPENAI_API_KEY) {
      throw new Error('Missing environment variable OPENAI_API_KEY; aborting.')
    }

    this.client = client
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  }

  async promptGPT(userPrompt: string, model = this.#GPT_MODEL) {
    const res = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    return res.choices[0].message?.content?.trim()
  }

  async translateToEnglish(originalText: string) {
    return this.promptGPT(`
    ${LOCALIZATION_PROMPT}
    Translate the following text to English unless it is already in English, in which case return it as is.
    ---
    ${originalText}
    `)
  }

  async translateFromEnglish(
    textToLocalize: string,
    targetLocale: Locale['languageCode'],
    localizationContext: LocalizationPair[]
  ) {
    return this.promptGPT(`
    ${LOCALIZATION_PROMPT}
    Translate the following text to ${targetLocale}.
    ---
    ${textToLocalize}
    ---
    GLOSSARY (en → ${targetLocale}):
    ${provideLocalizationContext(localizationContext)}
    `)
  }

  async translateFromEnglishAndSummarize(
    userQuestion: string,
    targetLocale: Locale['languageCode'],
    matchedFAQ: { question: string; answer: string },
    localizationContext: LocalizationPair[]
  ) {
    return this.promptGPT(`
    The player asked: “${userQuestion}”
    Respond helpfully in the language used by the player in their question (${targetLocale}).
    ${SUMMARIZE_PROMPT}
    ---
    Best match from the FAQ:
    Q: ${matchedFAQ.question}
    A: ${matchedFAQ.answer}
    ---
    GLOSSARY (en → ${targetLocale}):
    ${provideLocalizationContext(localizationContext)}
    `)
  }

  async summarize(
    userQuestion: string,
    matchedFAQ: { question: string; answer: string }
  ) {
    return this.promptGPT(`
    The player asked: “${userQuestion}”
    Respond helpfully in the language used by the player in their question.
    ${SUMMARIZE_PROMPT}
    ---
    Here is the best match from the FAQ:
    Q: ${matchedFAQ.question}
    A: ${matchedFAQ.answer}
    `)
  }

  isLanguageSupported(language: string) {
    return Boolean(LOCALES.find(locale => locale.languageCode === language))
  }

  async guessLanguage(userInput: string): Promise<Locale['languageCode']> {
    const guessedLanguage =
      this.client.languageIdentifier.findLanguage(userInput)

    if (
      guessedLanguage.probability > 0.9 &&
      this.isLanguageSupported(guessedLanguage.language)
    ) {
      return guessedLanguage.language
    }

    const chat = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        {
          role: 'system',
          content: `
            You are a language detector. Your task is to return the locale of the user's message.

            Only respond with one of these supported codes:
            ${LOCALES.filter(locale => locale.crowdin || locale.languageCode === 'en').map(locale => locale.languageCode)}

            If the user’s message is not clearly in one of those or you can’t figure it out, respond with: UNSUPPORTED
            Your response must be only the code or UNSUPPORTED — no explanations or punctuation.
            `,
        },
        {
          role: 'user',
          content: userInput,
        },
      ],
    })

    const guess = chat.choices[0].message?.content
    const isSupported = LOCALES.find(locale => locale.languageCode === guess)

    if (guess === 'UNSUPPORTED' || !isSupported) {
      console.warn(
        `ChatGPT guess the language as “${guess}”, which is not supported; falling back to English.`
      )
      return 'UNSUPPORTED_LANGUAGE'
    }

    return guess ?? 'en'
  }

  async translateEntry(
    { id, name, content }: ResolvedThread,
    language: string,
    localizationContext: LocalizationPair[]
  ) {
    const glossary = localizationContext
      .map(entry => `- ${entry.source} → ${entry.target}`)
      .join('\n')

    const combinedPrompt = `
    You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
    Translate the following two blocks of text from ‘en’ into ‘${language}’.
    Use the glossary below when relevant. Return only the translated text, using the same markers.
    
    GLOSSARY (en → ${language}):
    ${glossary}
  
    <<FAQ_TITLE>>
    ${name}
  
    <<FAQ_CONTENT>>
    ${content}
    `.trim()

    const translation = (await this.promptGPT(combinedPrompt, 'gpt-4o')) ?? ''
    const titleMatch = translation.match(
      /<<FAQ_TITLE>>\s*([\s\S]*?)\s*<<FAQ_CONTENT>>/
    )
    const contentMatch = translation.match(/<<FAQ_CONTENT>>\s*([\s\S]*)/)
    const translatedTitle = titleMatch?.[1].trim() ?? ''
    const translatedContent = contentMatch?.[1].trim() ?? ''

    if (!translatedTitle || !translatedContent) return

    const localized = {
      name: translatedTitle,
      content: translatedContent,
    }

    await saveTranslation(id, language, localized)

    return localized
  }

  buildGlossaryForEntry(
    content: string,
    translations: LocalizationPair[],
    { maxTerms = 100, scoreCutoff = -100 } = {}
  ) {
    const haystack = cleanUpString(content)
    const scored: { pair: LocalizationPair; score: number }[] = []

    for (const pair of translations) {
      const cleaned = cleanUpString(pair.source)
      const match = fuzzysort.single(cleaned, haystack)
      if (match && match.score >= scoreCutoff) {
        scored.push({ pair, score: match.score })
      }
    }

    // Sort by best match and limit count
    return scored
      .sort((a, b) => a.score - b.score)
      .slice(0, maxTerms)
      .map(result => result.pair)
  }

  async getProjectTranslations(
    events?: {
      onProjectBuildStarted?: () => void
      onProjectBuildEnded?: () => void
    },
    filePredicate: (file: decompress.File) => boolean = file => {
      if (file.path.includes('Quest')) return false
      if (file.path.includes('Special Item Descriptions')) return false
      if (file.path.includes('Tutorial')) return false
      return true
    }
  ) {
    const buildId = await crowdin.buildProject()
    await events?.onProjectBuildStarted?.()
    await crowdin.waitForBuild(buildId)
    await events?.onProjectBuildEnded?.()
    return crowdin.downloadBuildArtefact(buildId, filePredicate)
  }
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager(client)
  return localizationManager
}
export { cleanUpString }

import OpenAI from 'openai'
import type { Client } from 'discord.js'

import { BASE_PROMPT } from './SearchManager'
import { OPENAI_API_KEY } from '../constants/config'
import type { LocalizationPair } from './crowdin'
import { type Locale, LOCALES } from '../constants/i18n'

const LOCALIZATION_PROMPT = `
You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
`

const SUMMARIZE_PROMPT = `
When summarizing the FAQ answer into a more digestible and specific answer for the player, it is very important you do not take liberties with the content of the FAQ.
You must not change the meaning of the answer, and you must not add any information that is not in the FAQ.
Also be mindful about what appears like game terms, since their meaning can be subtle and matterns.
`

function provideLocalizationContext(
  sourceLocale: Locale['languageCode'],
  targetLocale: Locale['languageCode'],
  localizationContext: LocalizationPair[]
) {
  if (localizationContext.length === 0) return ''
  return `Here are how some key terms are translated from English into that language (${sourceLocale} → ${targetLocale}):${localizationContext
    .map(entry => `- “${entry.source}” → ${entry.target}`)
    .join('\n')}`
}

export class LocalizationManager {
  #GPT_MODEL = 'gpt-3.5-turbo'
  openai: OpenAI

  constructor() {
    if (!OPENAI_API_KEY) {
      throw new Error('Missing environment variable OPENAI_API_KEY; aborting.')
    }

    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  }

  async translate(
    content: string,
    sourceLocale: Locale['languageCode'],
    targetLocale: Locale['languageCode'],
    localizationContext: LocalizationPair[]
  ) {
    const res = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          ${LOCALIZATION_PROMPT}
          Translate the following text (guessed to be in the ‘${sourceLocale}’ locale) into the ‘${targetLocale}’ locale — unless it is already in said locale, in which case return it as is.
          ${content}
          
          ${provideLocalizationContext(sourceLocale, targetLocale, localizationContext)}`,
        },
      ],
    })

    return res.choices[0].message?.content?.trim() ?? content
  }

  async translateToEnglish(originalText: string) {
    const res = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          ${LOCALIZATION_PROMPT}
          Translate the following text to English unless it is already in English, in which case return it as is.
          ${originalText}`,
        },
      ],
    })

    return res.choices[0].message?.content?.trim() ?? originalText
  }

  async translateFromEnglish(
    textToLocalize: string,
    targetLocale: Locale['languageCode'],
    localizationContext: LocalizationPair[]
  ) {
    const response = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          ${LOCALIZATION_PROMPT}
          Translate the following text to ${targetLocale}.
          > ${textToLocalize}
          
          ${provideLocalizationContext('en', targetLocale, localizationContext)}`,
        },
      ],
    })

    return response.choices[0].message?.content?.trim()
  }

  async translateFromEnglishAndSummarize(
    userQuestion: string,
    targetLocale: Locale['languageCode'],
    matchedFAQ: { question: string; answer: string },
    localizationContext: LocalizationPair[]
  ) {
    const chat = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          The player asked: “${userQuestion}”
          
          Here is the best match from the FAQ:
          Q: ${matchedFAQ.question}
          A: ${matchedFAQ.answer}
          
          ${SUMMARIZE_PROMPT}
          
          Respond helpfully in the language used by the player in their question (${targetLocale}).
          ${provideLocalizationContext('en', targetLocale, localizationContext)}`,
        },
      ],
    })

    return chat.choices[0].message?.content
  }

  async summarize(
    userQuestion: string,
    matchedFAQ: { question: string; answer: string }
  ) {
    const chat = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          The player asked: “${userQuestion}”
          
          Here is the best match from the FAQ:
          Q: ${matchedFAQ.question}
          A: ${matchedFAQ.answer}
          
          ${SUMMARIZE_PROMPT}`,
        },
      ],
    })

    return chat.choices[0].message?.content
  }

  async guessLanguage(userInput: string) {
    const chat = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        {
          role: 'system',
          content: `
            You are a language detector. Your task is to return the locale of the user's message.

            Only respond with one of these supported codes:
            ${LOCALES.map(locale => locale.languageCode)}

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
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager()
  return localizationManager
}

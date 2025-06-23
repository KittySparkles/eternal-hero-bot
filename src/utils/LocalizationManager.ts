import OpenAI from 'openai'
import type { Client } from 'discord.js'

import { BASE_PROMPT } from './SearchManager'
import { OPENAI_API_KEY } from '../constants/config'
import type { LocalizationContext } from './crowdin'
import { type Locale, LOCALES } from '../constants/i18n'

const LOCALIZATION_PROMPT = `
You are a translation bot specifically for the game Eternal Hero, so the way you translate game terms is important.
`

const REPHRASING_PROMPT = `
When rephrasing the FAQ answer into a more digestible answer for the player, it is very important you do not take liberties with the content of the FAQ.
You must not change the meaning of the answer, and you must not add any information that is not in the FAQ.
Also be mindful about what appears like game terms, since their meaning can be subtle and matterns.
`

export class LocalizationManager {
  #GPT_MODEL = 'gpt-3.5-turbo'
  openai: OpenAI

  constructor() {
    if (!OPENAI_API_KEY) {
      throw new Error('Missing environment variable OPENAI_API_KEY; aborting.')
    }

    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY })
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
    locale: Locale['languageCode'],
    localizationContext: LocalizationContext
  ) {
    const response = await this.openai.chat.completions.create({
      model: this.#GPT_MODEL,
      messages: [
        { role: 'system', content: BASE_PROMPT },
        {
          role: 'user',
          content: `
          ${LOCALIZATION_PROMPT}
          Translate the following text to ${locale}.
          > ${textToLocalize}
          
          ${
            localizationContext
              ? `Here are how some key terms are translated from English into that language (EN → ${locale}):${localizationContext
                  .map(entry => `- “${entry.english}” → ${entry.localized}`)
                  .join('\n')}`
              : ''
          }`,
        },
      ],
    })

    return response.choices[0].message?.content?.trim()
  }

  async translateFromEnglishAndRephrase(
    userQuestion: string,
    locale: Locale['languageCode'],
    matchedFAQ: { question: string; answer: string },
    localizationContext: LocalizationContext
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
          
          ${REPHRASING_PROMPT}
          
          Respond helpfully in the language used by the player in their question (${locale}).
          ${
            localizationContext
              ? `Here are how some key terms are translated from English into that language (EN → ${locale}):${localizationContext
                  .map(entry => `- “${entry.english}” → ${entry.localized}`)
                  .join('\n')}`
              : ''
          }`,
        },
      ],
    })

    return chat.choices[0].message?.content
  }

  async rephrase(
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
          
          ${REPHRASING_PROMPT}`,
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

            If the user’s message is not clearly in one of those, respond with: unknown
            Your response must be only the code — no explanations or punctuation.
            `,
        },
        {
          role: 'user',
          content: userInput,
        },
      ],
    })

    const guess = chat.choices[0].message?.content

    if (guess === 'unknown') {
      console.warn('ChatGPT could not guess the language from', userInput)
      return 'UNKNOWN_LANGUAGE'
    }

    if (!LOCALES.find(locale => locale.languageCode === guess)) {
      console.warn(
        `ChatGPT guess the language as “${guess}”, which is not supported; falling back to English.`
      )
      return 'en'
    }

    return guess ?? 'en'
  }
}

export const initLocalizationManager = (client: Client) => {
  const localizationManager = new LocalizationManager()
  return localizationManager
}

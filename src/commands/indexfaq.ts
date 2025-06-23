import {
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  ForumChannel,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { Pinecone } from '@pinecone-database/pinecone'

import { logger } from '../utils/logger'
import { PINECONE_API_KEY } from '../constants/config'
import { pool } from '../utils/pg'

export const scope = 'OFFICIAL'

const INDEX_NAME = 'faq-index'
const pc = new Pinecone({ apiKey: PINECONE_API_KEY ?? '' })

export const data = new SlashCommandBuilder()
  .setName('indexfaq')
  .setDescription('Index the FAQ in Pinecone')

function getThreadTags(thread: AnyThreadChannel) {
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

export type PineconeMetadata = {
  entry_question: string
  entry_answer: string
  entry_tags: string[]
  entry_date: string
  entry_url: string
  entry_related_translation_ids: string[]
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
  relatedTranslationIds: string[]
}

export async function resolveThread(
  thread: AnyThreadChannel
): Promise<ResolvedThread> {
  const firstMessage = await thread.fetchStarterMessage()

  return {
    id: thread.id,
    name: thread.name,
    createdAt: thread.createdAt?.toISOString() ?? '',
    content: firstMessage?.content ?? '',
    tags: getThreadTags(thread),
    url: thread.url,
  }
}

function formatPineconeEntry(entry: ResolvedThread): PineconeEntry {
  return {
    id: `entry#${entry.id}`,
    chunk_text: `${entry.name}\n\n${entry.content}`,
    entry_question: entry.name,
    entry_answer: entry.content,
    entry_date: entry.createdAt ?? '',
    entry_tags: entry.tags,
    entry_url: entry.url,
    entry_related_translation_ids: entry.relatedTranslationIds,
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  logger.command(interaction)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const threads = interaction.client.faqManager.threads
  const threadsData = await Promise.all(
    threads.map(async thread => {
      const firstMessage = await thread.fetchStarterMessage()
      const result = await pool.query(
        'SELECT string_id FROM thread_to_crowdin_string WHERE thread_id = $1',
        [thread.id]
      )
      const stringIds = result.rows.map(row => row.string_id)

      return {
        id: thread.id,
        name: thread.name,
        createdAt: thread.createdAt?.toISOString(),
        content: firstMessage?.content ?? '',
        tags: getThreadTags(thread),
        url: thread.url,
        relatedTranslationIds: stringIds,
      }
    })
  )

  const index = pc.index(INDEX_NAME).namespace('en')
  const entries: PineconeEntry[] = threadsData
    .filter(entry => entry.content)
    .map(formatPineconeEntry)
  const count = entries.length

  while (entries.length) {
    const batch = entries.splice(0, 90)
    await index.upsertRecords(batch)
  }

  await interaction.editReply({
    content: `Indexed ${count} entries into Pinecone.`,
  })
}

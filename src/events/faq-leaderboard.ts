import type { Message, OmitPartialGroupDMChannel } from 'discord.js'
import { shouldIgnoreInteraction } from '../utils/should-ignore-interaction'
import { upsertContribution } from '../commands/faqleaderboard'

export async function faqLeaderboard(
  interaction: OmitPartialGroupDMChannel<Message<boolean>>
) {
  const { member, content, client, guildId } = interaction

  if (!member || !guildId) return
  if (shouldIgnoreInteraction(interaction)) return

  // Perform a quick and cheap check to figure out whether the message contains
  // any link whatsoever, otherwise return early.
  if (!content.includes('<#')) return

  if (client.faqManager.links.some(link => content.includes(link))) {
    upsertContribution(member.id, guildId)
  }
}

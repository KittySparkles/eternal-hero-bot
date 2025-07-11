import {
  type GuildBasedChannel,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
} from 'discord.js'

import { languageDetection } from './messageCreate.languageDetection'
import { discordLinking } from './messageCreate.discordLinking'

export type InteractionLike = OmitPartialGroupDMChannel<Message<boolean>>
export type EnsuredInteraction = Omit<
  InteractionLike,
  'guild' | 'member' | 'channel'
> & {
  guild: Guild
  member: GuildMember
  channel: GuildBasedChannel
}

export async function onMessageCreate(interaction: InteractionLike) {
  const { guild, member, channel, client } = interaction
  const { Discord } = client.managers

  // If the interaction is incomplete, or if it comes from a bot, do nothing.
  if (!guild || !member || member.user.bot || !guild.members.me) return

  // If the bot is running neither on the official server, nor on the testing
  // server, do nothing since Discord linking and language detection may not
  // be relevant at all.
  if (
    guild.id !== Discord.DISCORD_SERVER_ID &&
    guild.id !== Discord.TEST_SERVER_ID
  )
    return

  // If the interaction should be ignored, ignore it.
  if (Discord.shouldIgnoreInteraction(interaction)) return

  // If the channel is not text-based or not sendable, do nothing.
  if (!channel.isTextBased() || !channel.isSendable()) return

  // If the channel cannot be found (this should never happen since the channel
  // ID comes from the interaction itself), do nothing.
  const fullChannel = await Discord.getChannelFromInteraction(interaction)
  if (!fullChannel) return

  // If the bot is missing the permissions to post in the channel, do nothing.
  const permission = PermissionFlagsBits.SendMessages
  if (!fullChannel.permissionsFor(guild.members.me).has(permission)) return

  discordLinking(interaction as EnsuredInteraction)
  languageDetection(interaction as EnsuredInteraction, fullChannel)
}

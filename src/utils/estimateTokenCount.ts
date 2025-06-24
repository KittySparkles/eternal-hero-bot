import type { LocalizationPair } from './crowdin'
import type { ResolvedThread } from './FAQManager'

export function estimateTokenCount(
  thread: ResolvedThread,
  glossaryTerms: LocalizationPair[],
  overhead = 500
): number {
  const textLength = (thread.name?.length ?? 0) + (thread.content?.length ?? 0)

  const glossaryLength = glossaryTerms.reduce((acc, entry) => {
    const source = entry.source?.length ?? 0
    const target = entry.target?.length ?? 0
    return acc + source + target
  }, 0)

  const totalChars = textLength + glossaryLength
  const tokenEstimate = Math.ceil(totalChars / 4) + overhead

  return tokenEstimate
}

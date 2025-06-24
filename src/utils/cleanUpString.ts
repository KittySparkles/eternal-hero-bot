export function cleanUpString(string: string) {
  return (
    string
      // Remove line breaks
      .replace(/\n/g, '')
      // Replace pluralization tokens with the singular form
      .replace(/\{0:plural:([^|}]+)\|[^}]+\}/g, (_, singular) => singular)
      // Remove tags
      .replace(/<[a-z=]+>/g, '')
      .replace(/<\/[a-z=]+>/g, '')
  )
}

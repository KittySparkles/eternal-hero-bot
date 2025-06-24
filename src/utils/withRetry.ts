export async function withRetry<T>(fn: () => Promise<T>, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 + i * 1000))
    }
  }
}

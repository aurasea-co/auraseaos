// Shared server-only Anthropic client. Every LLM-backed feature in this
// codebase (competitor-screenshot extraction, the morning-brief action
// line) goes through this one lazy singleton so the provider can be
// swapped in one place if it ever needs to change, and so importing a
// caller module never throws at build/import time — only when a caller
// actually needs the client and no key is configured.

import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      '[ai] ANTHROPIC_API_KEY is not set. Add it to .env.local (and the deployment env) to enable AI features.',
    )
  }
  if (!client) client = new Anthropic({ apiKey })
  return client
}

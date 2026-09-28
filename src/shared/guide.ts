/** The paste-ready request for AI assistants: the ````text block in docs/ai-integration.md. */
export function aiRequestText(markdown: string): string {
  const match = /````text\r?\n([\s\S]*?)\r?\n````/.exec(markdown)
  return match ? match[1].trim() : ''
}

/** Files the deck guide can save for the teacher. */
export type GuideFile = 'ai-request' | 'example-deck' | 'protocol'

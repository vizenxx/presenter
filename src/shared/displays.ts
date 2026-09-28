export interface DisplayLike {
  id: number
  internal?: boolean
}

/** Console goes on the laptop (internal) display; the projector is any other display. */
export function pickDisplayIds(all: DisplayLike[], primaryId: number): { consoleId: number; projectorId: number | null } {
  if (all.length < 2) return { consoleId: primaryId, projectorId: null }
  const internal = all.find((d) => d.internal)
  const consoleId = internal ? internal.id : primaryId
  const projector = all.find((d) => d.id !== consoleId)
  return { consoleId, projectorId: projector ? projector.id : null }
}

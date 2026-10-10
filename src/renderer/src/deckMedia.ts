/**
 * Videos and sounds of a converted slide, where they stand on it (shared by the built-in viewers).
 * Before playing, the slide's own picture of the video shows; a ▶ sits on it. A click on it, or the
 * console's MEDIA command, plays or pauses it in place.
 */
import './deckMedia.css'

export interface SlideMedia {
  kind: 'video' | 'audio'
  /** Position and size in fractions of the slide. */
  x: number
  y: number
  w: number
  h: number
  /** The file next to the converted pages (media/…). */
  file: string
}

export interface MediaLayer {
  /** Builds the ▶ boxes for a slide (stops whatever played before). */
  show(media: SlideMedia[] | undefined): void
  /** Plays or pauses one of them (the others pause). */
  toggle(index: number): void
  /** The one playing, or null. */
  playing(): number | null
  /** Puts the layer exactly on the slide, in window pixels. */
  place(box: { left: number; top: number; width: number; height: number }): void
}

/** The layer element gets the boxes; onChange runs when something starts, pauses or ends. */
export function mediaLayer(layer: HTMLDivElement, onChange: () => void): MediaLayer {
  let players: HTMLMediaElement[] = []

  const playing = (): number | null => {
    const i = players.findIndex((p) => !p.paused && !p.ended)
    return i < 0 ? null : i
  }

  const toggle = (index: number): void => {
    const player = players[index]
    if (!player) return
    if (!player.paused && !player.ended) {
      player.pause()
      return
    }
    for (const p of players) if (p !== player) p.pause()
    if (player.ended) player.currentTime = 0
    void player.play().catch(() => undefined)
  }

  const show = (media: SlideMedia[] | undefined): void => {
    for (const p of players) p.pause()
    players = []
    layer.replaceChildren()
    for (const m of media ?? []) {
      const box = document.createElement('div')
      box.className = `media ${m.kind}`
      Object.assign(box.style, { left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` })
      const player = document.createElement(m.kind === 'audio' ? 'audio' : 'video') as HTMLMediaElement
      player.src = `/${m.file}`
      player.preload = 'metadata'
      if (player instanceof HTMLVideoElement) player.playsInline = true
      const play = document.createElement('div')
      play.className = 'play'
      const sync = (): void => {
        box.classList.toggle('playing', !player.paused && !player.ended)
        if (!player.paused) box.classList.add('started')
        onChange()
      }
      player.addEventListener('play', sync)
      player.addEventListener('pause', sync)
      player.addEventListener('ended', sync)
      player.addEventListener('error', () => {
        const note = document.createElement('div')
        note.className = 'note'
        note.textContent = `This ${m.kind === 'audio' ? 'sound' : 'video'} cannot play here (${m.file.split('.').pop()?.toUpperCase()}).`
        box.append(note)
      })
      box.addEventListener('click', () => toggle(players.indexOf(player)))
      box.append(player, play)
      layer.append(box)
      players.push(player)
    }
  }

  const place = (box: { left: number; top: number; width: number; height: number }): void => {
    Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
  }

  return { show, toggle, playing, place }
}

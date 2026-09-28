import type { ConsoleApi, RollerPlay, TimerView } from '../../shared/types'

declare global {
  interface Window {
    presenter: ConsoleApi
    overlay: { onTimer(cb: (t: TimerView) => void): void; pointer(): void }
    roller: { onPlay(cb: (play: RollerPlay) => void): void; onHide(cb: () => void): void; pointer(): void }
  }
}

export {}

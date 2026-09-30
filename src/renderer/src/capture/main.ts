// A window screen: another program's window, shown live (like screen sharing). The main
// process answers getDisplayMedia with the window the teacher picked.
const video = document.querySelector('video') as HTMLVideoElement
const note = document.getElementById('note') as HTMLDivElement

const say = (text: string): void => {
  note.textContent = text
  note.hidden = false
}

// A window that was minimized needs a moment to come back; try a few times.
async function connect(tries: number): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: false })
    video.srcObject = stream
    note.hidden = true
    stream.getVideoTracks()[0]?.addEventListener('ended', () => say('The window was closed. Remove this screen, or add the window again.'))
  } catch {
    if (tries > 1) {
      window.setTimeout(() => void connect(tries - 1), 700)
      return
    }
    say('This window cannot be shown. On a Mac, allow Presenter under System Settings → Privacy & Security → Screen & System Audio Recording.')
  }
}

void connect(6)

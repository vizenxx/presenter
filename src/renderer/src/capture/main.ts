// A window screen: another program's window, shown live (like screen sharing). The main
// process answers getDisplayMedia with the window the teacher picked.
const video = document.querySelector('video') as HTMLVideoElement
const note = document.getElementById('note') as HTMLDivElement

const say = (text: string): void => {
  note.textContent = text
  note.hidden = false
}

// A minimized window gives no picture until it is restored (when a projector shows it), so
// keep trying quietly; after a while also say why nothing shows yet.
async function connect(tries: number): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: false })
    video.srcObject = stream
    note.hidden = true
    stream.getVideoTracks()[0]?.addEventListener('ended', () => say('The window was closed. Remove this content, or add the window again.'))
  } catch {
    if (tries === 6) say('Waiting for the window. It comes forward when you choose a projector for it. (On a Mac, allow Presenter under System Settings → Privacy & Security → Screen & System Audio Recording.)')
    window.setTimeout(() => void connect(tries + 1), tries < 6 ? 700 : 1500)
  }
}

void connect(1)

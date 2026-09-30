// A window screen: another program's window, shown live (like screen sharing). The main
// process answers getDisplayMedia with the window the teacher picked.
const video = document.querySelector('video') as HTMLVideoElement
const note = document.getElementById('note') as HTMLDivElement

const say = (text: string): void => {
  note.textContent = text
  note.hidden = false
}

navigator.mediaDevices
  .getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: false })
  .then((stream) => {
    video.srcObject = stream
    note.hidden = true
    stream.getVideoTracks()[0]?.addEventListener('ended', () => say('The window was closed. Remove this screen, or add the window again.'))
  })
  .catch(() => say('This window cannot be shown. On a Mac, allow Presenter under System Settings → Privacy & Security → Screen & System Audio Recording.'))

/**
 * YouTube's embedded player needs the page to say who it is (HTTP Referer). A deck:// page sends none,
 * so the player shows "Error 153". YouTube's rule for desktop apps: set the Referer yourself to
 * https://<app id> (developers.google.com/youtube/terms/required-minimum-functionality, checked 2026-10-15).
 */
export const APP_REFERER = 'https://bt.edu.gcit.presenter/'

/** Request URLs of the embedded players that need it. */
export const EMBED_URLS = ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*']

/** The Referer to send instead, or null to keep the one the page sent (a real web page keeps its own). */
export function embedReferer(current: string | undefined): string | null {
  return current && /^https?:/i.test(current) ? null : APP_REFERER
}

/**
 * A page that Presenter shows lives on its own deck:// address, and a page there sends no Referer. A web
 * page that is embedded in a deck (YouTube, Vimeo, a map, a form) usually wants to know who embeds it, and
 * refuses otherwise (YouTube shows "Error 153"). A browser would send the deck's web address; Presenter
 * names itself instead, as YouTube asks of desktop apps
 * (developers.google.com/youtube/terms/required-minimum-functionality, checked 2026-10-15).
 *
 * This is general, not for one site: every embedded web page (a frame) in a deck gets it. The deck's own
 * pictures, scripts and files are left alone (a Referer there could only make a site refuse them).
 */
export const APP_REFERER = 'https://bt.edu.gcit.presenter/'

/** Request URLs this applies to: any web page (https); only frames are changed (see isEmbeddedFrame). */
export const EMBED_URLS = ['https://*/*']

/** Only a request for an embedded frame (an iframe) gets the app's Referer. */
export function isEmbeddedFrame(resourceType: string): boolean {
  return resourceType === 'subFrame'
}

/** The Referer to send instead, or null to keep the one the page sent (a real web page keeps its own). */
export function embedReferer(current: string | undefined): string | null {
  return current && /^https?:/i.test(current) ? null : APP_REFERER
}

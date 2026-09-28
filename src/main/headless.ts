/**
 * Test mode for a computer with a projector connected (a class may be on it):
 * no window ever shows and nothing makes a sound. Only the end-to-end test sets it.
 */
export const HEADLESS = process.env['PRESENTER_TEST'] === '1' && process.env['PRESENTER_HEADLESS'] === '1'

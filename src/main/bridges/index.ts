import sdk from '../../../sdk/presenter-bridge.js?raw'
import adapters from './framework-adapters.js?raw'

/**
 * Script run in the main world of every HTML deck after it loads: the public bridge
 * (sdk/presenter-bridge.js) plus adapters for Reveal.js, remark, impress.js and Marp.
 * Decks that speak the protocol themselves, or use none of these, are not affected.
 */
export const FRAMEWORK_BRIDGE = `${sdk}\n;${adapters}`

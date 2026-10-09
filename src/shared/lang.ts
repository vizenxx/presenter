/** Why a deck could not be opened (translated in the console). */
export type DeckErrorCode = 'unsupported' | 'missing' | 'no-converter' | 'convert-failed' | 'automation-denied' | 'open-failed'

/** Words the main process itself shows: window titles and file dialogs. */
export const MAIN_STRINGS = {
  consoleTitle: 'Presenter · Console',
  projectorTitle: 'Projector · Presenter',
  projectorWindowed: 'Projector (window) · Esc stops projecting',
  extraProjectorTitle: (n: number) => `Projector ${n} · Presenter`,
  openDeck: 'Open a deck',
  pickScreenDeck: 'Choose the deck for the new screen',
  deckFilter: 'Decks (PPT, Keynote, PDF, HTML)',
  defaultList: 'Sample list (click Edit)',
  untitledList: 'Untitled list',
  saveCopy: 'Save a copy',
  savePicture: 'Save the slide as a picture'
}

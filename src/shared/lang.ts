/** Interface language. English is the default; Chinese is one click away. */
export type Lang = 'en' | 'zh'

/** Why a deck could not be opened (translated in the console). */
export type DeckErrorCode = 'unsupported' | 'missing' | 'no-converter' | 'convert-failed' | 'automation-denied' | 'open-failed'

/** Words the main process itself shows: window titles and file dialogs. */
export const MAIN_STRINGS = {
  en: {
    consoleTitle: 'Presenter · Console',
    projectorTitle: 'Projector · Presenter',
    projectorWindowed: 'Projector (window) · Esc stops projecting',
    screenTitle: (n: number) => `Screen ${n} · Presenter`,
    openDeck: 'Open a deck',
    pickScreenDeck: 'Choose the deck for the new screen',
    deckFilter: 'Decks (PPT, Keynote, PDF, HTML)',
    defaultList: 'Sample list (click Edit)',
    untitledList: 'Untitled list',
    saveCopy: 'Save a copy'
  },
  zh: {
    consoleTitle: 'Presenter · 控制台',
    projectorTitle: '投影屏 · Presenter',
    projectorWindowed: '投影屏（窗口模式）· 按 Esc 停止投影',
    screenTitle: (n: number) => `屏幕 ${n} · Presenter`,
    openDeck: '打开课件',
    pickScreenDeck: '选择新屏幕要显示的课件',
    deckFilter: '课件（PPT、Keynote、PDF、HTML）',
    defaultList: '示例名单（点“编辑”换成你的班级）',
    untitledList: '未命名名单',
    saveCopy: '另存一份'
  }
} satisfies Record<Lang, Record<string, string | ((n: number) => string)>>

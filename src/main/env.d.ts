// `import text from 'file?raw'` embeds a file's text in the main bundle (Vite).
declare module '*?raw' {
  const text: string
  export default text
}

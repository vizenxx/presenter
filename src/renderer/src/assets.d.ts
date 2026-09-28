// Side-effect style imports are bundled by Vite.
declare module '*.css'

// `import url from 'file?url'` gives the built asset's URL.
declare module '*?url' {
  const url: string
  export default url
}

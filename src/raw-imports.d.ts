// A `?raw` import is the file's text: Vite in the browser, tools/raw-import-hooks.ts under Node.
declare module '*?raw' {
  const text: string;
  export default text;
}

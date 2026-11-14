// test:changed scans: none
// The folders a test depends on without importing anything from them: the ones it lists. tools/testChanged.mjs
// selects a test by its imports and by the paths its text names. A test that lists a folder and checks what it finds
// (a sweep over src/, a count of migrations) reaches a new file through neither, so a change that adds one would not
// select it. The declaration above stops this file's own patterns from reading as a walk.
//
// A file declares the folders it lists with a comment line:
//   // test:changed scans: src/ server/src/
// `.` is the whole tree, and `none` declares that the file lists nothing in the tree (a temporary folder). A file with
// no declaration that walks folders recursively is taken to scan the whole tree, so a new sweep is never missed.

const DECLARATION = /^\s*(?:\/\/|\*)\s*test:changed scans:\s*(.+?)\s*$/m;
const LISTING_CALL = /\b(?:readdirSync|readdir|opendirSync|opendir|globSync|glob)\s*\(/;
const RECURSIVE_LISTING = /\b(?:readdirSync|readdir|opendirSync|opendir|globSync|glob)\s*\([^;]*recursive:\s*true/;
const FUNCTION_START = /function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g;

/** The text of the function body that starts at `start`: the braces' content, or an arrow's expression to the line's end. */
function bodyAt(text: string, start: number): string {
  const arrow = text.indexOf('=>', start);
  const brace = text.indexOf('{', start);
  const arrowExpression = arrow >= 0 && (brace < 0 || arrow < brace) && !/^\s*\{/.test(text.slice(arrow + 2));
  if (arrowExpression) {
    const end = text.indexOf('\n', arrow);
    return text.slice(arrow + 2, end < 0 ? undefined : end);
  }
  if (brace < 0) return '';
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(brace, i + 1);
    }
  }
  return text.slice(brace);
}

/** Whether `text` walks folders recursively: a recursive listing, `git ls-files`, or a function that lists a folder and calls itself. */
export function walksRecursively(text: string): boolean {
  if (RECURSIVE_LISTING.test(text) || text.includes('ls-files')) return true;
  // Most files list nothing; the function scan below is slow on a host of thousands of lines.
  if (!LISTING_CALL.test(text)) return false;
  for (const match of text.matchAll(FUNCTION_START)) {
    const name = match[1] ?? match[2];
    // From the parameter list's `(` of a function, or the `=>` of an arrow.
    const body = bodyAt(text, match.index + match[0].length - (match[1] ? 1 : 2));
    if (LISTING_CALL.test(body) && new RegExp(`\\b${name}\\(`).test(body)) return true;
  }
  return false;
}

/** The repository folders `text` scans (`.` for the whole tree): its declaration, else the whole tree for a recursive walk, else none. */
export function scansOf(text: string): string[] {
  const declared = DECLARATION.exec(text);
  if (declared) {
    const folders = declared[1].split(/\s+/).map((folder) => folder.replace(/\/+$/, '') || '.');
    return folders.includes('none') ? [] : folders;
  }
  return walksRecursively(text) ? ['.'] : [];
}

/** Whether `path` lies in `folder` (`.` holds every path). Paths use `/`. */
export function isUnder(path: string, folder: string): boolean {
  return folder === '.' || path === folder || path.startsWith(`${folder}/`);
}

/**
 * Whether `text` lists a folder and names `path`'s own folder, so it may count or read the files there: a fixture or
 * migrations folder that a helper lists with one `readdirSync`. Only a folder two or more levels deep counts, because a
 * top-level name such as `src` appears in nearly every file. The folders above it do not count: `src/systems` is named
 * by hundreds of files that list something else. A file that builds the folder's path from parts declares it instead.
 */
export function listsFolderOf(text: string, path: string): boolean {
  const folder = path.slice(0, Math.max(0, path.lastIndexOf('/')));
  if (!folder.includes('/')) return false;
  return LISTING_CALL.test(text) && text.includes(folder);
}

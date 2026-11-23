// Shows that an edit changed only comments. Each file is compared with its version at a git ref, with the comments
// left out. The comment-cleanup agent (.claude/agents/comment-cleanup.md) runs it on every file it rewrites.
//
//   node tools/same-code.ts <file>...                # against HEAD
//   node tools/same-code.ts --base <ref> <file>...
//
// Exit code 1 when a file's code differs or a file cannot be read or parsed. A file type it cannot check (HTML, CSS)
// is listed as unchecked and does not fail the run: review that diff by hand.
//
// In YAML, TOML and shell files, every line that starts with `#` is read as a comment, except a `#!` first line. A `#`
// line inside a YAML block scalar or a heredoc is text, not a comment, and is not checked: review those lines by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parse, type Comment, type Options, type Token } from 'acorn';
import { isMain } from './lib/isMain.mjs';

const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'];
const TYPESCRIPT_EXTENSIONS = ['.ts', '.mts', '.cts'];
const HASH_COMMENT_EXTENSIONS = ['.yml', '.yaml', '.toml', '.sh'];
const JSON_EXTENSIONS = ['.json', '.jsonc'];

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** True when `codeOf` can read files with this path's extension. */
export function canCheck(path: string): boolean {
  const extension = extensionOf(path);
  return [...SCRIPT_EXTENSIONS, ...HASH_COMMENT_EXTENSIONS, ...JSON_EXTENSIONS].includes(extension);
}

function parseWithComments(source: string): { tokens: Token[]; comments: Comment[] } {
  // A file that is not a module (a CommonJS script, a preload) is read as a script.
  let lastError: unknown;
  for (const sourceType of ['module', 'script'] as const) {
    const tokens: Token[] = [];
    const comments: Comment[] = [];
    const options: Options = { ecmaVersion: 'latest', sourceType, onToken: tokens, onComment: comments };
    try {
      parse(source, options);
      return { tokens, comments };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function scriptCode(text: string, typescript: boolean): string[] {
  // Stripping replaces each type with spaces, so offsets in `source` are offsets in `text`.
  const source = typescript ? stripTypeScriptTypes(text, { mode: 'strip' }) : text;
  const { tokens, comments } = parseWithComments(source);
  // The tokens hold every string and template exactly. The text with its comments cut out also holds the types,
  // which the stripped source no longer has; its whitespace is collapsed because a deleted comment line moves it.
  const tokenTexts = tokens.map((token) => source.slice(token.start, token.end));
  let withoutComments = '';
  let at = 0;
  for (const comment of comments) {
    withoutComments += text.slice(at, comment.start) + ' ';
    at = comment.end;
  }
  withoutComments += text.slice(at);
  return [...tokenTexts, '\u0000', withoutComments.replace(/\s+/g, ' ').trim()];
}

function isHashComment(line: string, index: number): boolean {
  // A shebang names the interpreter that runs the file, so it is code.
  if (index === 0 && line.startsWith('#!')) return false;
  return line.trimStart().startsWith('#');
}

function hashCommentCode(text: string): string[] {
  // Only whole-line comments are left out. A trailing `# ...` may sit inside a string, so it counts as code.
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index) => line.trim() !== '' && !isHashComment(line, index));
}

/** The parts of `text` that are code, in order, so two versions of a file have the same code when these are equal. */
export function codeOf(path: string, text: string): string[] {
  const extension = extensionOf(path);
  if (SCRIPT_EXTENSIONS.includes(extension)) return scriptCode(text, TYPESCRIPT_EXTENSIONS.includes(extension));
  if (HASH_COMMENT_EXTENSIONS.includes(extension)) return hashCommentCode(text);
  // JSON with comments (tsconfig.json) parses as one JavaScript expression.
  if (JSON_EXTENSIONS.includes(extension)) return scriptCode(`(${text}\n)`, false);
  throw new Error(`cannot read the code of a ${extension || 'extensionless'} file`);
}

/** True when `before` and `after` differ only in comments and whitespace outside strings. */
export function sameCode(path: string, before: string, after: string): boolean {
  const a = codeOf(path, before);
  const b = codeOf(path, after);
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

function main(argv: string[]): number {
  let base = 'HEAD';
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i];
    else files.push(argv[i].split('\\').join('/'));
  }
  let failed = 0;
  for (const file of files) {
    if (!canCheck(file)) {
      console.log(`unchecked  ${file} (review its diff by hand)`);
      continue;
    }
    try {
      const before = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
      const after = readFileSync(file, 'utf8');
      const same = sameCode(file, before, after);
      if (!same) failed++;
      console.log(`${same ? 'same' : 'CHANGED'}  ${file}`);
    } catch (error) {
      failed++;
      console.log(`ERROR  ${file}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));

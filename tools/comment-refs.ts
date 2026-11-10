// Fails a pull request that adds a code comment, or an error or warning message, that carries a decision, a pull
// request or an item tag. The rule is in .claude/rules/comments.md and docs/README.md ("Code comments"): a comment
// says why, a message says what went wrong in words, and a reference belongs in the commit message and the pull
// request description.
//
//   node tools/comment-refs.ts [--base <ref>]     # default: $BASE_REF, else origin/feat/tamriel-review
//
// Two kinds of added line are checked:
//   - a comment line: any decision, pull request, audit or item tag in it;
//   - the first argument of `throw new SomeError(...)`, `console.warn(...)` or `console.error(...)`: only a tag it
//     opens with, because a tag later in a message is read as a word.
// A tag passes once for each time the same change removes it, so an old tag on a line you edit, or on a comment you
// move to another file, does not fail the check, and a change that adds a tag more often than it removes it does.
// Exit code 1 lists each added line and the tag it carries.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parse, type Comment, type Node, type Options } from 'acorn';
import { isMain } from './lib/isMain.mjs';

const DEFAULT_BASE = 'origin/feat/tamriel-review';
const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'];
const TYPESCRIPT_EXTENSIONS = ['.ts', '.mts', '.cts'];
const SKIPPED_PREFIXES = ['vendor/', 'node_modules/'];

export type Tag = { kind: 'decision' | 'pull-request' | 'audit' | 'item'; tag: string };
export type Hit = Tag & { file: string; line: number; text: string; where: 'comment' | 'message' };
export type DiffLines = { added: Map<string, number[]>; removed: Map<string, Map<string, number>> };

// Technical names that look like item tags: a letter run with a digit, or capitals with a hyphen.
const TECHNICAL_NAME =
  /^(?:UTF-?(?:8|16|32)(?:LE|BE)?|SHA-?\d+|MD5|AES-?\d+|[HR]S\d+|ES\d+|RGBA?\d*|DXT\d|BC\d+|MP[34]|H26[45]|WEBGL\d?|ARENA2|ASD-STE100|STE100|ISO-?\d+|RFC\d+|IEEE\d+|WGS84|CRC\d+|X11|PCM\d+|FSB\d|CP\d+|F\d{1,2}|HTTP\d|IPV[46]|TLS\d+|SSL\d|I18N|L10N|A11Y|E2E|W3C|V8|EC2|S3|R2|D1|UV\d|LOD\d|R\d+F|RG\d+F?|NPC-?\d+|CSS\d?|HTML\d|PNG\d+|GIF\d+|BMP\d+|OGG|JSON\d?)$/;

const DECISION = /\bdecisions?\s+\d+/gi;
const PULL_REQUEST = /\b(?:PRs?|pull requests?)\s+#?\d+|\bissues?\s+#\d+|(?<![\w&/#-])#\d{1,5}(?![\w-])/gi;
const AUDIT = /\bAUDIT(?![a-z])/g;
const ITEM = /(?<![\w.-])(?:[A-Z][A-Z0-9]*\d[A-Z0-9]*(?:\.\d+[a-z]?)*|[A-Z]{2,}(?:-[A-Z0-9]+)+)(?![\w-])/g;

/** The decision, pull request, audit and item tags a piece of comment text carries. */
export function tagsIn(text: string): Tag[] {
  const found: Tag[] = [];
  const add = (kind: Tag['kind'], pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) found.push({ kind, tag: match[0].trim() });
  };
  add('decision', DECISION);
  add('pull-request', PULL_REQUEST);
  add('audit', AUDIT);
  for (const match of text.matchAll(ITEM)) {
    if (!TECHNICAL_NAME.test(match[0])) found.push({ kind: 'item', tag: match[0] });
  }
  return found;
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** True when `commentLines` reads files with this path. */
export function isCheckedFile(path: string): boolean {
  return SCRIPT_EXTENSIONS.includes(extensionOf(path)) && !SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function parseSource(source: string): { tree: Node; comments: Comment[] } {
  let lastError: unknown;
  for (const sourceType of ['module', 'script'] as const) {
    const comments: Comment[] = [];
    const options: Options = {
      ecmaVersion: 'latest',
      sourceType,
      onComment: comments,
      allowHashBang: true,
      locations: true,
    };
    try {
      return { tree: parse(source, options), comments };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** The parts of an ESTree node that the message scan reads. Acorn's own `Node` type has none of them. */
type Syntax = {
  type: string;
  loc?: { start: { line: number } };
  value?: unknown;
  operator?: string;
  left?: Syntax;
  quasis?: { value: { cooked?: string | null } }[];
  callee?: Syntax;
  computed?: boolean;
  object?: Syntax;
  property?: Syntax;
  name?: string;
  arguments?: Syntax[];
};

/** What `scanFile` finds in one file, each by 1-based line number. */
export type FileText = { comments: Map<number, string>; messages: Map<number, string> };

/** The leading text of a message's first argument: a string, a template's first part, or a concatenation's first part. */
function leadingText(node: Syntax | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis?.[0]?.value.cooked ?? undefined;
  if (node.type === 'BinaryExpression' && node.operator === '+') return leadingText(node.left);
  return undefined;
}

/** True for `new SomeError(...)`, `console.warn(...)` and `console.error(...)`: the calls whose text a user can read. */
function isMessageCall(node: Syntax): boolean {
  if (node.type === 'NewExpression') return node.callee?.type === 'Identifier' && /Error$/.test(node.callee.name ?? '');
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'console' &&
    (callee.property?.name === 'warn' || callee.property?.name === 'error')
  );
}

function collectMessages(node: Syntax, messages: Map<number, string>): void {
  if (isMessageCall(node)) {
    const argument = node.arguments?.[0];
    const lead = leadingText(argument);
    if (argument?.loc && lead !== undefined) messages.set(argument.loc.start.line, lead);
  }
  for (const child of Object.values(node)) {
    const children: unknown[] = Array.isArray(child) ? child : [child];
    for (const item of children) {
      if (item && typeof item === 'object' && typeof (item as Syntax).type === 'string') {
        collectMessages(item as Syntax, messages);
      }
    }
  }
}

/** The tags a message opens with: its first word, up to a colon, a space or a closing bracket. */
export function openingTags(message: string): Tag[] {
  const word = /^\s*\[?([^\s:\]]+)/.exec(message)?.[1];
  return word ? tagsIn(word) : [];
}

/** The comment text and the message starts on each line of a file. A line with none is absent. */
export function scanFile(path: string, text: string): FileText {
  // Stripping replaces each type with spaces, so offsets in the stripped source are offsets in `text`.
  const source = TYPESCRIPT_EXTENSIONS.includes(extensionOf(path))
    ? stripTypeScriptTypes(text, { mode: 'strip' })
    : text;
  const lines = new Map<number, string>();
  const lineStarts = [0];
  for (let at = source.indexOf('\n'); at >= 0; at = source.indexOf('\n', at + 1)) lineStarts.push(at + 1);
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  const { tree, comments } = parseSource(source);
  const messages = new Map<number, string>();
  collectMessages(tree as unknown as Syntax, messages);
  for (const comment of comments) {
    // Acorn reads a hashbang as a comment; it names the interpreter, so it is code.
    if (comment.start === 0 && source.startsWith('#!')) continue;
    const first = lineOf(comment.start);
    comment.value.split('\n').forEach((part, index) => {
      const line = first + index;
      lines.set(line, `${lines.get(line) ?? ''} ${part}`.trim());
    });
  }
  return { comments: lines, messages };
}

/** The comment text on each line of a file, by 1-based line number. A line with no comment is absent. */
export function commentLines(path: string, text: string): Map<number, string> {
  return scanFile(path, text).comments;
}

/**
 * The lines a zero-context unified diff adds (by file and new line number) and how many times its removed lines carry
 * each tag (by file, then tag).
 */
export function parseDiff(diff: string): DiffLines {
  const added = new Map<string, number[]>();
  const removed = new Map<string, Map<string, number>>();
  let oldFile = '';
  let file = '';
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('--- ')) {
      oldFile = raw === '--- /dev/null' ? '' : raw.slice(6);
    } else if (raw.startsWith('+++ ')) {
      file = raw === '+++ /dev/null' ? '' : raw.slice(6);
    } else if (raw.startsWith('@@')) {
      newLine = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
    } else if (raw.startsWith('+') && file) {
      added.set(file, [...(added.get(file) ?? []), newLine]);
      newLine += 1;
    } else if (raw.startsWith('-')) {
      const counts = removed.get(file || oldFile) ?? new Map<string, number>();
      for (const { tag } of tagsIn(raw.slice(1))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      removed.set(file || oldFile, counts);
    }
  }
  return { added, removed };
}

/**
 * The added comment lines and message starts that carry a tag the change does not remove as often. A tag passes once for each time the
 * change removes it, from the same file first, so a moved or reworded comment passes and a tag the change adds beyond
 * what it removes does not. `read` returns a file's new text.
 */
export function findHits(diff: string, read: (file: string) => string): Hit[] {
  const { added, removed } = parseDiff(diff);
  const spend = (file: string, tag: string): boolean => {
    for (const source of [file, ...removed.keys()]) {
      const left = removed.get(source)?.get(tag) ?? 0;
      if (left > 0) {
        removed.get(source)?.set(tag, left - 1);
        return true;
      }
    }
    return false;
  };
  const hits: Hit[] = [];
  for (const [file, lines] of added) {
    if (!isCheckedFile(file)) continue;
    let scanned: FileText;
    try {
      scanned = scanFile(file, read(file));
    } catch {
      // A file that does not parse cannot be told apart from its comments: leave it to review.
      continue;
    }
    for (const line of lines) {
      const comment = scanned.comments.get(line);
      if (comment) {
        for (const found of tagsIn(comment)) {
          if (!spend(file, found.tag)) hits.push({ ...found, file, line, text: comment, where: 'comment' });
        }
      }
      const message = scanned.messages.get(line);
      if (message) {
        for (const found of openingTags(message)) {
          if (!spend(file, found.tag)) hits.push({ ...found, file, line, text: message, where: 'message' });
        }
      }
    }
  }
  return hits.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
}

/** The hits of the working tree against the merge base with `base`, for the repository at `cwd`. */
export function checkAgainst(base: string, cwd = process.cwd()): Hit[] {
  const mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim();
  const diff = git(['diff', '-U0', '--no-color', '--no-ext-diff', mergeBase], cwd);
  return findHits(diff, (file) => readFileSync(`${cwd}/${file}`, 'utf8'));
}

function main(argv: string[]): number {
  const at = argv.indexOf('--base');
  const base = at >= 0 ? argv[at + 1] : process.env.BASE_REF || DEFAULT_BASE;
  const hits = checkAgainst(base);
  if (hits.length === 0) {
    console.log(`comment-refs: no added comment cites a decision, pull request or item tag (base ${base})`);
    return 0;
  }
  for (const hit of hits)
    console.log(`${hit.file}:${hit.line}: ${hit.kind} "${hit.tag}" in ${hit.where}: ${hit.text.slice(0, 100)}`);
  console.log(
    `\ncomment-refs: ${hits.length} added comment line(s) carry a reference. State the reason in words, or delete the\n` +
      'comment; the reference goes in the commit message and the pull request description (.claude/rules/comments.md).',
  );
  return 1;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));

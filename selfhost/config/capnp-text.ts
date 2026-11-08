// Writes a value as Cap'n Proto text, the syntax of a workerd config: an object is a struct `( field = value, ... )`,
// an array is a list `[ ... ]`, a string is a text literal, and `embed(path)` is `embed "path"`, which workerd reads
// from a file beside the config.

export type Embed = { readonly embed: string };
export type CapnpValue = string | number | boolean | Embed | CapnpValue[] | { [field: string]: CapnpValue | undefined };

export const embed = (path: string): Embed => ({ embed: path });

const isEmbed = (v: unknown): v is Embed =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && 'embed' in v;

/** A Cap'n Proto text literal. Cap'n Proto has no `\u` escape, so a non-ASCII character is written as its UTF-8
 *  bytes in `\x` escapes. */
export function textLiteral(s: string): string {
  let out = '"';
  for (const byte of new TextEncoder().encode(s)) {
    if (byte === 0x22) out += '\\"';
    else if (byte === 0x5c) out += '\\\\';
    else if (byte === 0x0a) out += '\\n';
    else if (byte === 0x0d) out += '\\r';
    else if (byte === 0x09) out += '\\t';
    else if (byte < 0x20 || byte > 0x7e) out += `\\x${byte.toString(16).padStart(2, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return `${out}"`;
}

export function capnpText(value: CapnpValue, indent = ''): string {
  const inner = `${indent}  `;
  if (typeof value === 'string') return textLiteral(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`a Cap'n Proto number must be finite, not ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (isEmbed(value)) return `embed ${textLiteral(value.embed)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${inner}${capnpText(v, inner)},\n`).join('')}${indent}]`;
  }
  const fields = Object.entries(value).filter((entry): entry is [string, CapnpValue] => entry[1] !== undefined);
  if (fields.length === 0) return '()';
  return `(\n${fields.map(([k, v]) => `${inner}${k} = ${capnpText(v, inner)},\n`).join('')}${indent})`;
}

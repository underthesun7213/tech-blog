import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');
export const IMAGES_DIR = path.join(ROOT, 'public', 'images');

export const SOURCE_LANG = 'ko';
export const TARGET_LANGS = ['en', 'ja'] as const;
export type TargetLang = (typeof TARGET_LANGS)[number];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type Frontmatter = Record<string, unknown>;

export function parseMarkdown(raw: string): { data: Frontmatter; body: string } {
  const text = raw.replace(/^﻿/, '');
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { data: {}, body: text };
  const data = (YAML.parse(match[1]) ?? {}) as Frontmatter;
  return { data, body: text.slice(match[0].length) };
}

export function stringifyMarkdown(data: Frontmatter, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null));
  const yaml = YAML.stringify(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

export function readMarkdown(file: string) {
  return parseMarkdown(readFileSync(file, 'utf8'));
}

/** Recursively list files, skipping dot-folders (.obsidian, .trash, .git ...). */
export function walk(dir: string, skipDirs: Set<string> = new Set()): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!skipDirs.has(name)) out.push(...walk(full, skipDirs));
    } else {
      out.push(full);
    }
  }
  return out;
}

export function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Hash of the parts of a source post that translations depend on. */
export function sourceHash(data: Frontmatter, body: string) {
  return sha256(JSON.stringify({ title: data.title ?? '', description: data.description ?? '', body: body.trim() }));
}

export function toDateString(value: unknown): string | undefined {
  if (value instanceof Date && !isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return undefined;
}

/** Split markdown into code / non-code segments so transforms never touch code. */
export function splitCode(body: string): { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = [];
  const re = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)/g;
  let last = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const start = m.index + m[1].length;
    if (start > last) parts.push({ code: false, text: body.slice(last, start) });
    parts.push({ code: true, text: body.slice(start, re.lastIndex) });
    last = re.lastIndex;
  }
  if (last < body.length) parts.push({ code: false, text: body.slice(last) });
  return parts;
}

/** Apply fn to prose only: fenced code blocks and `inline code` are left untouched. */
export function mapProse(body: string, fn: (prose: string) => string): string {
  return splitCode(body)
    .map((part) => {
      if (part.code) return part.text;
      const inline: string[] = [];
      const protectedText = part.text.replace(/(`+)[^`\n]*?\1/g, (m) => `\u0000${inline.push(m) - 1}\u0000`);
      return fn(protectedText).replace(/\u0000(\d+)\u0000/g, (_, i) => inline[Number(i)]);
    })
    .join('');
}

export function codeBlocks(body: string): string[] {
  return splitCode(body)
    .filter((p) => p.code)
    .map((p) => p.text.trim());
}

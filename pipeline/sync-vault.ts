/**
 * Copy notes marked `publish: true` from the Obsidian vault into src/content/posts/ko/.
 *
 *   VAULT_PATH=/path/to/vault node pipeline/sync-vault.ts
 *
 * Privacy: this runs in a public repo's CI, so it only ever logs or writes published notes.
 * Unpublished notes are read for link resolution but never copied, and wiki-links pointing
 * at them are reduced to plain text.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  IMAGES_DIR,
  POSTS_DIR,
  SOURCE_LANG,
  mapProse,
  parseMarkdown,
  readMarkdown,
  stringifyMarkdown,
  toDateString,
  walk,
  type Frontmatter,
} from './lib.ts';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);
const SKIP_DIRS = new Set(['node_modules', 'templates', 'Templates']);

const vaultPath = process.env.VAULT_PATH;
if (!vaultPath || !existsSync(vaultPath)) {
  console.error('Set VAULT_PATH to your Obsidian vault folder (e.g. in .env).');
  process.exit(1);
}
const vault = path.resolve(vaultPath);
const outDir = path.join(POSTS_DIR, SOURCE_LANG);

type Note = { file: string; name: string; rel: string; data: Frontmatter; body: string };
type Published = Note & { slug: string };

// ---------------------------------------------------------------- index the vault
const files = walk(vault, SKIP_DIRS);
const notes: Note[] = [];
const attachments = new Map<string, string>(); // basename (lowercase) -> full path

for (const file of files) {
  if (file.endsWith('.md')) {
    const { data, body } = parseMarkdown(readFileSync(file, 'utf8'));
    const rel = path.relative(vault, file).replaceAll('\\', '/').replace(/\.md$/, '');
    notes.push({ file, name: path.basename(rel), rel, data, body });
  } else {
    attachments.set(path.basename(file).toLowerCase(), file);
  }
}

function slugify(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

const errors: string[] = [];
const published: Published[] = [];
for (const note of notes) {
  if (note.data.publish !== true) continue;
  const slug = typeof note.data.slug === 'string' ? slugify(note.data.slug) : slugify(note.name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    errors.push(`"${note.rel}": add an English \`slug:\` to its frontmatter (URLs must be a-z, 0-9, -).`);
    continue;
  }
  published.push({ ...note, slug });
}
const bySlug = new Map<string, Published>();
for (const p of published) {
  if (bySlug.has(p.slug)) errors.push(`Duplicate slug "${p.slug}": "${bySlug.get(p.slug)!.rel}" and "${p.rel}".`);
  bySlug.set(p.slug, p);
}
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}

// Wiki-link target lookup: Obsidian resolves by note name, or by path when one is given.
const noteByKey = new Map<string, Note>();
for (const n of notes) {
  noteByKey.set(n.name.toLowerCase(), n);
  noteByKey.set(n.rel.toLowerCase(), n);
}
const slugOfNote = new Map<Note, string>();
for (const p of published) slugOfNote.set(notes.find((n) => n.file === p.file)!, p.slug);

// ---------------------------------------------------------------- transforms
function headingAnchor(heading: string) {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function copyAttachment(slug: string, name: string): string | undefined {
  const src = attachments.get(path.basename(name).toLowerCase());
  if (!src) return undefined;
  const fileName = path.basename(src).replace(/\s+/g, '-');
  const destDir = path.join(IMAGES_DIR, slug);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, path.join(destDir, fileName));
  return `/images/${slug}/${encodeURIComponent(fileName)}`;
}

function resolveLink(target: string): { url?: string; label: string } {
  const [notePart, heading] = target.split('#');
  const key = notePart.trim().replace(/\.md$/i, '').toLowerCase();
  const note = noteByKey.get(key);
  const label = heading && !notePart ? heading : path.basename(notePart.trim()) || heading || target;
  const slug = note ? slugOfNote.get(note) : undefined;
  if (!slug) return { label }; // private or missing note: keep the text, drop the link
  return { url: `/${SOURCE_LANG}/posts/${slug}/${heading ? `#${headingAnchor(heading)}` : ''}`, label };
}

function convert(body: string, slug: string, missing: string[]): string {
  // Obsidian comments %% ... %% can span lines; remove before anything else.
  body = mapProse(body, (s) => s.replace(/%%[\s\S]*?%%/g, ''));
  return mapProse(body, (s) =>
    s
      // ![[image.png|300]] / ![[Note]] embeds
      .replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => {
        const ext = path.extname(target).toLowerCase();
        if (IMAGE_EXT.has(ext)) {
          const url = copyAttachment(slug, target);
          if (!url) return (missing.push(target), '');
          const alt = alias && !/^\d+(x\d+)?$/.test(alias) ? alias : path.basename(target, ext);
          return `![${alt}](${url})`;
        }
        if (ext && ext !== '.md') {
          const url = copyAttachment(slug, target);
          return url ? `[${path.basename(target)}](${url})` : (missing.push(target), '');
        }
        const { url, label } = resolveLink(target);
        return url ? `[${alias || label}](${url})` : alias || label;
      })
      // [[Note]], [[Note|alias]], [[Note#Heading]]
      .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => {
        const { url, label } = resolveLink(target);
        return url ? `[${alias || label}](${url})` : alias || label;
      })
      // Standard markdown images pointing at vault attachments
      .replace(/!\[([^\]]*)\]\((?!https?:|\/)([^)\s]+)\)/g, (m, alt: string, src: string) => {
        const url = copyAttachment(slug, decodeURIComponent(src));
        return url ? `![${alt}](${url})` : (missing.push(src), m);
      })
      // ==highlight==
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      // > [!note] Title  ->  > **Title**
      .replace(/^(>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_, q: string, type: string, title: string) =>
        `${q}**${title || type.charAt(0).toUpperCase() + type.slice(1)}**`,
      ),
  );
}

function normalizeTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  return list.map((t) => String(t).replace(/^#/, '').trim()).filter((t) => t && t !== 'publish');
}

// ---------------------------------------------------------------- write posts
mkdirSync(outDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
let written = 0;

for (const note of published) {
  const outFile = path.join(outDir, `${note.slug}.md`);
  const existing = existsSync(outFile) ? readMarkdown(outFile).data : {};
  rmSync(path.join(IMAGES_DIR, note.slug), { recursive: true, force: true });
  const missing: string[] = [];
  const body = convert(note.body, note.slug, missing);

  const data: Frontmatter = {
    title: typeof note.data.title === 'string' ? note.data.title : note.name,
    description: typeof note.data.description === 'string' ? note.data.description : undefined,
    pubDate: toDateString(note.data.pubDate) ?? toDateString(note.data.date) ?? toDateString(existing.pubDate) ?? today,
    updatedDate: toDateString(note.data.updatedDate) ?? toDateString(note.data.updated),
    tags: normalizeTags(note.data.tags),
    draft: note.data.draft === true ? true : undefined,
    syncedFromVault: true,
  };
  const next = stringifyMarkdown(data, body);
  const prev = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  if (next !== prev) {
    writeFileSync(outFile, next);
    written++;
    console.log(`✓ ${note.slug}${prev ? ' (updated)' : ' (new)'}`);
  }
  for (const m of missing) console.warn(`  ! ${note.slug}: attachment not found: ${m}`);
}

// Remove posts that were synced before but are no longer published in the vault.
let removed = 0;
const publishedSlugs = new Set(published.map((p) => p.slug));
for (const file of walk(outDir)) {
  const slug = path.basename(file, path.extname(file));
  if (publishedSlugs.has(slug)) continue;
  if (readMarkdown(file).data.syncedFromVault !== true) continue; // hand-written post, leave it
  rmSync(file);
  rmSync(path.join(IMAGES_DIR, slug), { recursive: true, force: true });
  removed++;
  console.log(`− ${slug} (unpublished)`);
}

console.log(
  `\nSync done: ${published.length} published note(s), ${written} written, ${removed} removed, ` +
    `${notes.length - published.length} private note(s) skipped.`,
);

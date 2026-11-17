/**
 * Translate Korean posts into English and Japanese with Claude.
 *
 *   node pipeline/translate.ts            # translate new or changed posts
 *   node pipeline/translate.ts --dry-run  # only list what would be translated
 *   node pipeline/translate.ts --force    # retranslate everything
 *
 * A translation stores `sourceHash` (hash of the Korean title, description and body it came from).
 * When the Korean post changes, the hash no longer matches and the post is translated again.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import YAML from 'yaml';
import { z } from 'zod';
import {
  POSTS_DIR,
  ROOT,
  SOURCE_LANG,
  TARGET_LANGS,
  codeBlocks,
  readMarkdown,
  sourceHash,
  stringifyMarkdown,
  toDateString,
  walk,
  type Frontmatter,
  type TargetLang,
} from './lib.ts';

const MODEL = process.env.TRANSLATE_MODEL ?? 'claude-opus-5-5';
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const LANG_NAME: Record<TargetLang, string> = { en: 'English', ja: 'Japanese' };
const STYLE: Record<TargetLang, string> = {
  en: 'Write natural, concise technical English as a native developer would. Avoid literal translation.',
  ja: 'です・ます調で、日本のエンジニア向け技術ブログとして自然な日本語にしてください。直訳は避けてください。',
};

type Glossary = Record<string, Partial<Record<TargetLang, string>>>;
const glossaryFile = path.join(ROOT, 'pipeline', 'glossary.yaml');
const glossary: Glossary = existsSync(glossaryFile) ? (YAML.parse(readFileSync(glossaryFile, 'utf8')) ?? {}) : {};

const Translation = z.object({
  title: z.string(),
  description: z.string(),
  body: z.string(),
});

// ---------------------------------------------------------------- find work
type Job = { slug: string; lang: TargetLang; src: { data: Frontmatter; body: string }; hash: string; reason: string };

const sourceFiles = walk(path.join(POSTS_DIR, SOURCE_LANG)).filter((f) => /\.mdx?$/.test(f));
const sourceSlugs = new Set(sourceFiles.map((f) => path.basename(f, path.extname(f))));
const jobs: Job[] = [];

for (const file of sourceFiles) {
  const slug = path.basename(file, path.extname(file));
  const src = readMarkdown(file);
  const hash = sourceHash(src.data, src.body);
  for (const lang of TARGET_LANGS) {
    const target = path.join(POSTS_DIR, lang, `${slug}.md`);
    if (!existsSync(target)) {
      jobs.push({ slug, lang, src, hash, reason: 'new' });
      continue;
    }
    const current = readMarkdown(target).data.sourceHash;
    if (current === undefined) continue; // hand-written translation, never overwrite
    if (force || current !== hash) jobs.push({ slug, lang, src, hash, reason: force ? 'forced' : 'source changed' });
  }
}

// Remove machine translations whose Korean source is gone.
for (const lang of TARGET_LANGS) {
  for (const file of walk(path.join(POSTS_DIR, lang))) {
    const slug = path.basename(file, path.extname(file));
    if (!sourceSlugs.has(slug) && readMarkdown(file).data.sourceHash !== undefined) {
      if (!dryRun) rmSync(file);
      console.log(`− ${lang}/${slug} (source removed)`);
    }
  }
}

if (jobs.length === 0) {
  console.log('All translations are up to date.');
  process.exit(0);
}
for (const j of jobs) console.log(`• ${j.lang}/${j.slug} (${j.reason})`);
if (dryRun) {
  console.log(`\nDry run: ${jobs.length} translation(s) needed.`);
  process.exit(0);
}

// ---------------------------------------------------------------- translate
const client = new Anthropic();

/** A problem with one post's translation; other posts can still be translated. */
class PostError extends Error {}

function systemPrompt(lang: TargetLang) {
  const terms = Object.entries(glossary)
    .filter(([, t]) => t[lang])
    .map(([ko, t]) => `- ${ko} → ${t[lang]}`)
    .join('\n');
  return [
    `You translate Korean technical blog posts into ${LANG_NAME[lang]}.`,
    STYLE[lang],
    '',
    'Rules:',
    '- Keep the Markdown structure exactly: headings, lists, tables, blockquotes, emphasis, HTML tags.',
    '- Copy fenced code blocks and `inline code` character for character. Do not translate code, comments in code, commands, file paths, or identifiers.',
    '- Keep every URL and link target unchanged; translate only the visible link text.',
    '- Keep product and library names in their original form (React, Astro, Obsidian...).',
    '- Translate the title and description too. If the description is empty, return an empty string.',
    '- Output only the translation. Do not add notes, summaries, or explanations.',
    terms ? `\nGlossary (always use these):\n${terms}` : '',
  ].join('\n');
}

async function translate(job: Job) {
  const { data, body } = job.src;
  const input = JSON.stringify({ title: data.title ?? '', description: data.description ?? '', body: body.trim() });

  // Streaming keeps long posts clear of HTTP timeouts; finalMessage() still returns parsed_output.
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // on a refusal, the API retries on a fallback model
      system: systemPrompt(job.lang),
      messages: [{ role: 'user', content: `Translate this post. Input JSON:\n${input}` }],
      output_config: { format: betaZodOutputFormat(Translation) },
    })
    .finalMessage();

  if (response.stop_reason === 'refusal') throw new PostError(`refused (${response.stop_details?.category ?? 'unknown'})`);
  if (response.stop_reason === 'max_tokens') throw new PostError('output cut off at max_tokens');
  const out = response.parsed_output;
  if (!out) throw new PostError('could not parse the translation');

  // Internal links point at the Korean version; send readers to the same language.
  const translatedBody = out.body.replace(/\]\(\/ko\/posts\//g, `](/${job.lang}/posts/`);

  // Guard: code must survive translation untouched.
  const before = codeBlocks(body);
  const after = codeBlocks(translatedBody);
  if (before.length !== after.length || before.some((block, i) => block !== after[i])) {
    throw new PostError('code blocks changed during translation');
  }

  const frontmatter: Frontmatter = {
    title: out.title,
    description: out.description || undefined,
    pubDate: toDateString(data.pubDate),
    updatedDate: toDateString(data.updatedDate),
    tags: data.tags,
    draft: data.draft,
    sourceHash: job.hash,
  };
  const dir = path.join(POSTS_DIR, job.lang);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${job.slug}.md`), stringifyMarkdown(frontmatter, translatedBody));
  return response.usage;
}

let failed = 0;
let inputTokens = 0;
let outputTokens = 0;
for (const job of jobs) {
  try {
    const usage = await translate(job);
    inputTokens += usage.input_tokens;
    outputTokens += usage.output_tokens;
    console.log(`✓ ${job.lang}/${job.slug}`);
  } catch (error) {
    failed++;
    const message =
      error instanceof Anthropic.AuthenticationError
        ? 'no valid API key (set ANTHROPIC_API_KEY)'
        : error instanceof Anthropic.RateLimitError
          ? 'rate limited, try again later'
          : error instanceof Anthropic.APIError
            ? `API error ${error.status}: ${error.message}`
            : error instanceof Error
              ? error.message
              : String(error);
    console.error(`✗ ${job.lang}/${job.slug}: ${message}`);
    // Credential or setup problems fail every post the same way: stop instead of repeating them.
    const perPost =
      error instanceof PostError ||
      (error instanceof Anthropic.APIError && !(error instanceof Anthropic.AuthenticationError));
    if (!perPost) {
      failed += jobs.length - jobs.indexOf(job) - 1;
      break;
    }
  }
}

console.log(`\nTranslate done: ${jobs.length - failed} ok, ${failed} failed. Tokens: ${inputTokens} in / ${outputTokens} out.`);
if (failed) process.exit(1);

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Posts live at src/content/posts/<lang>/<slug>.md
 * The same <slug> across languages links translations together.
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Set by pipeline/sync-vault.ts on posts copied from the Obsidian vault
    syncedFromVault: z.boolean().optional(),
    // Set by pipeline/translate.ts: hash of the source (ko) post this translation was made from
    sourceHash: z.string().optional(),
    // Set by pipeline/translate.ts: hash of what it wrote, to detect later edits by hand
    translationHash: z.string().optional(),
  }),
});

export const collections = { posts };

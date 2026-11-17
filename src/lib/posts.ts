import { getCollection, type CollectionEntry } from 'astro:content';
import { isLang, langs, type Lang } from '@/i18n/ui';

export type Post = CollectionEntry<'posts'>;

/** "ko/hello-world" -> { lang: "ko", slug: "hello-world" } */
export function parsePostId(id: string): { lang: Lang; slug: string } {
  const [lang, ...rest] = id.split('/');
  if (!isLang(lang) || rest.length === 0) {
    throw new Error(`Post "${id}" must live in src/content/posts/<${langs.join('|')}>/`);
  }
  return { lang, slug: rest.join('/') };
}

export async function getPosts(lang?: Lang): Promise<Post[]> {
  const all = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return all
    .filter((p) => !lang || parsePostId(p.id).lang === lang)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postUrl(lang: Lang, slug: string) {
  return `/${lang}/posts/${slug}/`;
}

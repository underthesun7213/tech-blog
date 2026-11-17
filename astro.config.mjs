// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export const LOCALES = ['ko', 'en', 'ja'];
export const DEFAULT_LOCALE = 'ko';

export default defineConfig({
  // TODO: replace with the real domain once deployed (used for canonical, hreflang, sitemap)
  site: 'https://tech-blog.example.com',
  trailingSlash: 'ignore',
  i18n: {
    defaultLocale: DEFAULT_LOCALE,
    locales: LOCALES,
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false, // src/pages/index.astro picks the visitor's language
    },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' },
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});

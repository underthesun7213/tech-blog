export const languages = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
} as const;

export type Lang = keyof typeof languages;
export const langs = Object.keys(languages) as Lang[];
export const defaultLang: Lang = 'ko';

export const htmlLang: Record<Lang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
};

export const ui = {
  ko: {
    'site.title': '기술 블로그',
    'site.description': '개발하며 배운 것들을 기록합니다.',
    'nav.posts': '글',
    'nav.language': '언어',
    'posts.empty': '아직 글이 없습니다.',
    'posts.recent': '최근 글',
    'post.published': '작성일',
    'post.updated': '수정일',
    'post.notTranslated': '이 글은 아직 이 언어로 번역되지 않았습니다.',
    'post.back': '← 글 목록',
    '404.title': '페이지를 찾을 수 없습니다',
    '404.home': '홈으로',
  },
  en: {
    'site.title': 'Tech Blog',
    'site.description': 'Notes on what I learn while building things.',
    'nav.posts': 'Posts',
    'nav.language': 'Language',
    'posts.empty': 'No posts yet.',
    'posts.recent': 'Recent posts',
    'post.published': 'Published',
    'post.updated': 'Updated',
    'post.notTranslated': 'This post is not yet available in this language.',
    'post.back': '← All posts',
    '404.title': 'Page not found',
    '404.home': 'Go home',
  },
  ja: {
    'site.title': '技術ブログ',
    'site.description': '開発を通して学んだことを記録しています。',
    'nav.posts': '記事',
    'nav.language': '言語',
    'posts.empty': 'まだ記事がありません。',
    'posts.recent': '最近の記事',
    'post.published': '公開日',
    'post.updated': '更新日',
    'post.notTranslated': 'この記事はまだこの言語に翻訳されていません。',
    'post.back': '← 記事一覧',
    '404.title': 'ページが見つかりません',
    '404.home': 'ホームへ',
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type UIKey = keyof (typeof ui)[typeof defaultLang];

export function useTranslations(lang: Lang) {
  return (key: UIKey) => ui[lang][key] ?? ui[defaultLang][key];
}

export function isLang(value: string | undefined): value is Lang {
  return !!value && value in languages;
}

export function formatDate(date: Date, lang: Lang) {
  return new Intl.DateTimeFormat(htmlLang[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

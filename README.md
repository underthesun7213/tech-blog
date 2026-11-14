# tech-blog

Multilingual tech blog (한국어 / English / 日本語), built with [Astro](https://astro.build).

## Develop

Requires Node 22.23+.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run check    # type check
```

## Content

Posts live at `src/content/posts/<lang>/<slug>.md`. Files with the same `<slug>` in different
language folders are linked as translations (language switcher + `hreflang` tags).

```yaml
---
title: Post title
description: One-line summary
pubDate: 2026-11-15
tags: [astro]
draft: false
---
```

URLs: `/ko/posts/<slug>/`, `/en/posts/<slug>/`, `/ja/posts/<slug>/`. The root `/` sends visitors to
their browser language (default: ko).

## Planned pipeline

Obsidian vault (`publish: true` notes) → sync + wiki-link conversion → translation (ko → en, ja) → PR → deploy

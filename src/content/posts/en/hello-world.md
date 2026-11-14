---
title: Starting the blog
description: The first post on a tech blog that publishes Obsidian notes in Korean, English, and Japanese
pubDate: 2026-11-15
tags: [blog, astro]
---

Notes in my Obsidian vault marked `publish: true` get published to this blog.

## How it works

- Posts are written in Korean first.
- A translation pipeline produces the English and Japanese versions.
- Posts with the same file name (slug) are linked as translations of each other.

```ts
const langs = ['ko', 'en', 'ja'] as const;
```

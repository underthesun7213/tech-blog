---
title: ブログを始めます
description: Obsidianのノートを韓国語・英語・日本語で公開する技術ブログの最初の記事
pubDate: 2026-11-15
tags: [blog, astro]
---

Obsidianに書き溜めたノートのうち、`publish: true` を付けたものをこのブログで公開します。

## 仕組み

- 原文は韓国語で書きます。
- 翻訳パイプラインが英語版と日本語版を作成します。
- 同じファイル名（slug）を持つ記事同士が翻訳版として紐づきます。

```ts
const langs = ['ko', 'en', 'ja'] as const;
```

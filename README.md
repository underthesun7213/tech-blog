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

## Publishing pipeline

```
Obsidian vault (publish: true) → npm run sync → src/content/posts/ko/
                                → npm run translate → src/content/posts/{en,ja}/
                                → PR → merge → deploy
```

### Marking a note for publishing

```yaml
---
publish: true
slug: react-state        # required when the note name isn't English
title: React 상태관리 정리
description: One-line summary
date: 2026-11-15
tags: [react]
---
```

`npm run sync` (`pipeline/sync-vault.ts`)
- Copies only `publish: true` notes; private notes are never copied or logged
- `[[wiki-links]]` to published notes become blog links; links to private notes become plain text
- `![[image.png]]` embeds are copied to `public/images/<slug>/`
- `%% comments %%` are removed, `==highlights==` become `<mark>`, callouts become bold-titled quotes
- Posts that are no longer published are removed (hand-written posts are left alone)

`npm run translate` (`pipeline/translate.ts`, Claude API)
- Translates only new posts or posts whose Korean source changed (`sourceHash`)
- Uses `pipeline/glossary.yaml` for fixed terms; fails a post if any code block changes
- `--dry-run` lists the work, `--force` retranslates everything
- Translations without `sourceHash` are treated as hand-written and never overwritten

### Local run

```bash
cp .env.example .env   # set VAULT_PATH and ANTHROPIC_API_KEY
npm run pipeline
```

### GitHub Actions

`.github/workflows/publish.yml` runs daily at 06:00 KST and on demand, and opens a PR.
Repository secrets:
- `VAULT_TOKEN`: fine-grained token with read-only **Contents** access to `obsidian-vault`
- `ANTHROPIC_API_KEY`: Claude API key

Also enable *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*.

# omra

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

> **Note interne (2026-08-09)** : ce README est le squelette v0 d'origine,
> pas une documentation du projet réel — voir `docs/facturation/reprise.md`
> et `RAPPORT-NUIT.md` (racine du dépôt) pour l'architecture et l'état réel
> du module Facturation. Point technique confirmé cette nuit-là : contrairement
> à la ligne « Every merge to `main` will automatically deploy » ci-dessous,
> le travail réel se fait sur `integration-facturation` (jamais `main`,
> voir `CLAUDE.md` local) — chaque push y déclenche une **préversion**
> Vercel automatique, mais **pas** une mise à jour de l'alias de production
> (`omra-chi.vercel.app`) : celle-ci exige une promotion manuelle
> (`vercel promote <url>` ou le tableau de bord Vercel).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_fKUad0XLVP8q8SVu760iXIGnFxQ2)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

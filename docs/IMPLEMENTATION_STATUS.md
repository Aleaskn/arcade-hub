# Stato implementazione

Aggiornato: 20 novembre 2026.

## Checklist

- [x] Analisi repository e piano integrale
- [x] Verifica documentazione ufficiale Discord/Cloudflare aggiornata
- [x] Fondazione monorepo pnpm e TypeScript strict
- [x] Engine puro: Tris, Forza 3, Forza 4
- [x] Protocollo condiviso validato con Zod
- [x] Worker HTTP, autenticazione demo/Discord e D1
- [x] Durable Object SQLite-backed con WebSocket Hibernation
- [x] Frontend React/Vite/Tailwind responsive in italiano
- [x] Demo multiplayer locale completa
- [x] Test unitari, integrazione, E2E e carico leggero
- [x] Build e documentazione finale

## Decisioni tecniche

- Un solo Worker in produzione serve API, WebSocket e asset statici, così gli URL relativi funzionano anche dietro URL Mapping Discord.
- In sviluppo Vite (`:5173`) inoltra `/api` e `/api/.../socket` a Wrangler (`:8787`).
- Ogni stanza è un Durable Object SQLite-backed; D1 contiene soltanto dati globali minimizzati, risultati e ranking.
- La demo usa identità esplicite e sessioni firmate, è abilitata esclusivamente dai comandi locali con `DEMO_MODE=true`; il config di deploy usa `false` e non accetta risultati dichiarati dal client.

## Esito

- Fondazione, engine, backend, frontend e demo: **IMPLEMENTATO**.
- Wrangler locale, D1/DO, multiplayer, build e test: **VERIFICATO LOCALMENTE**.
- OAuth reale, Activity nel client e Cloudflare remoto: **IN ATTESA DI CREDENZIALI O TEST DISCORD**.

## Verifiche esterne ancora necessarie

- Credenziali Discord OAuth e prova nel client Discord: **PENDING**.
- Creazione D1 reale, aggiornamento `database_id` e deploy Cloudflare: **PENDING** e non autorizzato in questa esecuzione.

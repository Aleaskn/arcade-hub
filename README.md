# Arcade Hub

Arcade Hub è una Discord Activity multiplayer privata, in italiano, per **Tris**, **Forza 3** (5×4) e **Forza 4** (7×6). Due utenti giocano, gli altri assistono. Il server è autoritativo: turni, mosse, risultati e ranking non vengono accettati dal browser come dati fidati.

Stato del progetto:

- **IMPLEMENTATO**: engine, lobby, ready/start, tre giochi, spettatori, rivincita, riconnessione, forfeit, ranking e storico.
- **VERIFICATO LOCALMENTE**: Worker, Durable Objects SQLite-backed, D1, demo a più browser, build, test unitari/integration/E2E e carico leggero.
- **IN ATTESA DI CREDENZIALI O TEST DISCORD**: OAuth con app reale, URL Mapping, prova nel client Discord e deploy Cloudflare.

## Avvio rapido della demo

Requisiti: Node.js 22 o successivo e pnpm 10 o successivo.

```bash
pnpm install
pnpm dev:demo
```

Apri [http://localhost:5173](http://localhost:5173) in due schede o browser, scegli nomi diversi e usa il codice stanza mostrato dal primo giocatore. Una terza scheda che entra durante una partita diventa spettatore. La scritta **DEMO — identità simulata** resta sempre visibile.

Lo stato locale è persistito in `.wrangler/state` e sopravvive ai riavvii. Per azzerarlo, a server spento:

```bash
pnpm clean:demo
pnpm demo:prepare
```

Per provare il bundle di produzione locale sulla stessa origin:

```bash
pnpm preview
```

Poi apri [http://localhost:8787](http://localhost:8787).

## Comandi di verifica

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm exec playwright install chromium  # solo la prima volta
pnpm test:e2e
pnpm test:load
```

`pnpm deploy` è predisposto ma **non va eseguito** prima di configurare D1, secret e Discord come descritto in [DEPLOY_DISCORD_CLOUDFLARE.md](docs/DEPLOY_DISCORD_CLOUDFLARE.md).

## Struttura

- `apps/web`: React 19, Vite 8 e Tailwind CSS 4.
- `apps/worker`: Hono, API HTTP, OAuth, D1 e `GameRoom` Durable Object.
- `packages/game-engine`: engine puro TypeScript, senza dipendenze UI/cloud.
- `packages/shared`: tipi e protocollo runtime Zod, versione 1.
- `migrations`: schema D1 versionato.
- `tests/e2e` e `scripts`: E2E, integrazione e carico leggero.

Le versioni effettive sono bloccate in `pnpm-lock.yaml`. Quelle principali verificate sono TypeScript 6.0.3, React 19.3.1, Vite 8.3.8, Tailwind CSS 4.3.5, Discord Embedded App SDK 2.5.0, Hono 4.13.19, Zod 4.6.7, Wrangler 4.165.0, Vitest 5.1.1 e Playwright 1.65.1.

## Documentazione

- [Architettura](docs/ARCHITECTURE.md)
- [Sviluppo locale](docs/DEVELOPMENT.md)
- [Deploy Discord + Cloudflare](docs/DEPLOY_DISCORD_CLOUDFLARE.md)
- [Sicurezza e privacy](docs/SECURITY.md)
- [Rapporto test](docs/TEST_REPORT.md)
- [Stato implementazione](docs/IMPLEMENTATION_STATUS.md)

Non viene promesso funzionamento 24/7 né capacità garantita sul piano Free: le quote sono esterne e possono cambiare. La configurazione include osservabilità e un interruttore `NEW_LOBBIES_ENABLED` per sospendere nuove stanze.

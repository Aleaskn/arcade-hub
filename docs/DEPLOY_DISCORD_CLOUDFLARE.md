# Deploy privato Discord + Cloudflare

Questa procedura non è stata eseguita: richiede account e credenziali. I comandi di deploy hanno effetti esterni; controlla sempre account e configurazione prima di lanciarli.

## Quote verificate il 20 novembre 2026

La documentazione ufficiale indica per Durable Objects Free SQLite-backed 100.000 richieste/giorno, 13.000 GB-s/giorno e 5 GB di storage account. D1 Free indica 5 milioni di righe lette/giorno, 100.000 scritte/giorno, 5 GB totali e 10 database. Superare una quota Free può far fallire le operazioni fino al reset: non è una garanzia 24/7.

Fonti: [Discord Activities](https://docs.discord.com/developers/activities/overview), [Build Your First Activity](https://docs.discord.com/developers/activities/building-an-activity), [Durable Objects WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

## Cloudflare

1. Crea o seleziona un account Workers Free e controlla che non siano configurati upgrade automatici indesiderati.
2. Esegui `pnpm install` e `wrangler login`.
3. Crea D1 con il nome già presente nel config: `wrangler d1 create arcade-hub-local` (il suffisso identifica il nome tecnico, non l'ambiente remoto).
4. Sostituisci il `database_id` segnaposto in `wrangler.jsonc` con quello restituito.
5. Applica le migrazioni: `wrangler d1 migrations apply arcade-hub-local --remote`.
6. Imposta secret, senza inserirli in file o shell history condivise:

   ```bash
   wrangler secret put DISCORD_CLIENT_SECRET
   wrangler secret put SESSION_SECRET
   ```

7. Aggiungi `DISCORD_CLIENT_ID` come variabile non segreta nel config. Lascia `DEMO_MODE=false`.
8. Verifica `NEW_LOBBIES_ENABLED=true`, `observability.enabled=true` e l'account corrente con `wrangler whoami`.
9. Esegui localmente `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
10. Solo quando autorizzato, esegui `pnpm deploy`. Annota l'URL `https://<worker>.<subdomain>.workers.dev`.

Worker e asset statici vengono distribuiti insieme. Non servono Pages, VPS, Redis o processi sempre attivi.

## Discord Developer Portal

1. Crea un'applicazione, conserva Application ID e Client Secret in modo separato.
2. Abilita Activities e Developer Mode sul profilo usato per i test.
3. Configura l'URL Mapping del prefisso `/` verso l'origin HTTPS del Worker. Il frontend usa route relative, quindi `/api` e i WebSocket passano dallo stesso mapping.
4. Configura il redirect OAuth indicato dal portale per Embedded App SDK e abilita gli scope minimi `identify` e `guilds` usati dal codice.
5. Inserisci Application ID in `VITE_DISCORD_CLIENT_ID` durante la build (o nel file env di build non segreto). Ricostruisci e ridistribuisci.
6. Aggiungi il comando/entry point predefinito dell'Activity secondo il portale.
7. Limita l'installazione e la distribuzione al server di prova/amici; non abilitare discovery pubblica.

## Verifica privata

1. Apri l'Activity nel client Discord desktop con due account reali nello stesso server e nella stessa istanza.
2. Controlla che non compaia il badge DEMO e che i due utenti abbiano ID distinti.
3. Ripeti Tris e Forza 4, spettatore, refresh, disconnessione oltre/sotto 90 secondi e rivincita.
4. Avvia in DM: la classifica deve essere isolata per istanza e la UI non deve confonderla con una guild.
5. Controlla Worker Logs senza token/codici e D1 Metrics per righe lette/scritte.
6. Controlla dashboard Durable Objects per richieste e durata; verifica hibernation durante inattività.
7. Prova `NEW_LOBBIES_ENABLED=false` in un ambiente di test e verifica il messaggio quota.
8. Documenta URL, versione, account, data del test e rollback.

## Differenze fra ambienti

- **Demo browser**: identità simulata, solo locale, badge evidente, nessun account Discord.
- **Activity reale**: OAuth, iframe Discord, guild/instance SDK e origin mappata.
- **Rilascio agli amici**: distribuzione privata nel Developer Portal dopo test reali e monitoraggio quote.

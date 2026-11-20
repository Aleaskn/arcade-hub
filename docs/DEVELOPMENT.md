# Sviluppo locale

## Demo a due o tre utenti

```bash
pnpm install
pnpm dev:demo
```

Servizi:

- `http://localhost:5173`: Vite con reload, inoltra `/api` e WebSocket a Wrangler.
- `http://localhost:8787`: Worker locale, DO, D1 e asset del bundle se già costruiti.
- `.wrangler/state`: persistenza locale di D1 e Durable Objects.

Apri due schede. `sessionStorage`, non `localStorage`, assegna un `deviceId` diverso a ogni scheda. Scegli due nomi, crea la stanza nel primo browser e inserisci il codice nel secondo. Un terzo accesso quando i due slot sono occupati è spettatore.

La demo non usa header di autenticazione accettati in produzione: passa dall'endpoint esplicitamente disabilitabile `/api/auth/demo` e riceve la stessa sessione firmata del resto dell'app.

## Debug WebSocket

Gli eventi hanno `version: 1`, `roomId`, `revision`, `type` e `payload`. I comandi aggiungono un `commandId` UUID. Nel pannello Network del browser filtra `socket`; il primo messaggio deve essere `room.snapshot`. La riconnessione richiede un nuovo ticket e ignora snapshot con revisione più vecchia.

Per controllare direttamente il backend:

```bash
curl http://localhost:8787/api/health
```

## Dati locali

Per azzerare fixture, ranking, stanze e stato DO:

```bash
# arresta prima dev:demo
pnpm clean:demo
pnpm demo:prepare
```

Lo script rimuove esclusivamente il percorso validato `<repo>/.wrangler/state`.

## Test

`pnpm test:integration` applica le migrazioni, avvia e arresta Wrangler automaticamente e verifica tre utenti, idempotenza, ranking, riconnessione, rivincita, più stanze e token falso. `pnpm test:e2e` usa Chromium con tre contesti isolati. Anche `pnpm test:load` prepara, avvia e arresta autonomamente il Worker.

Se la porta 8787 è occupata, arresta l'altro processo Wrangler prima dei test automatici.

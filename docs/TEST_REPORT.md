# Rapporto test

Esecuzione locale del 20 novembre 2026 su macOS arm64, Node 22.22.0, pnpm 11.25.0, Wrangler 4.165.0 e Chromium 159 headless.

## Risultati effettivi

| Gate | Risultato |
| --- | --- |
| TypeScript strict | PASS, 4 workspace |
| Unit test Vitest | PASS, 22 test (21 engine + 1 protocollo) |
| Integrazione Wrangler/DO/D1 | PASS, 11 controlli, 162 ms nel comando autonomo finale |
| E2E Playwright | PASS, 1 scenario completo, 3,1 s (4,2 s suite finale) |
| Build Vite | PASS, 2.302 moduli, JS 514,58 kB / 157,12 kB gzip |
| Build Worker dry-run | PASS, 875,44 KiB upload / 144,83 KiB gzip |
| Migrazione D1 locale | PASS, 10 comandi SQL |
| Carico leggero | PASS, 30 utenti / 15 stanze, 0 errori |

L'integrazione ha verificato tre identità, spettatore bloccato, ready/start, vittoria Tris server-side, retry idempotente, ranking 1025 con una sola partita, riconnessione, snapshot, rivincita con nuovo match ID, due lobby e token falso 401.

L'E2E ha usato tre contesti browser isolati: Tris completo, spettatore su viewport mobile, rivincita e Forza 4 verticale. Ha prodotto `test-results/tris-desktop.png` e `test-results/tris-mobile-spectator.png`. L'ispezione ha individuato e portato alla correzione delle righe Tris compresse; la suite finale dopo la correzione è passata.

## Carico misurato

Comando autonomo: `pnpm test:load`.

- 30 partecipanti, 15 stanze (5 per gioco), 3 cicli disconnessione/riconnessione.
- 454 ms totali nell'ambiente locale (esecuzione autonoma finale).
- 178 operazioni misurate; p50 19,7 ms; p95 56,6 ms.
- 130 messaggi client e 312 eventi ricevuti; 0 errori.

Questi numeri misurano soltanto loopback locale e non dimostrano capacità Cloudflare/Discord reale.

## Stima, non misurazione produttiva

Assumendo 30 utenti, quattro azioni/minuto e quattro ore/giorno: circa 28.800 messaggi WebSocket. Con 15 stanze e una partita ogni 10 minuti: 360 match e circa 2.520 scritture di riga D1 di base, prima del costo addizionale degli indici. La stima resta sotto le quote Free consultate, ma traffico HTTP, retry, letture, indici e altre applicazioni nello stesso account consumano quota. Va confermata con Analytics dopo un test privato.

## Non verificato

- OAuth e Activity dentro client Discord reale: credenziali assenti.
- Deploy e metriche Cloudflare remote: non autorizzati.
- Hibernation/risveglio dopo eviction reale del runtime cloud: l'API è usata e Wrangler locale è stato testato, ma l'eviction cloud non è forzabile in modo equivalente.
- Forfeit reale dopo 90 secondi nell'E2E: logica alarm presente; il percorso è coperto strutturalmente ma il gate rapido non attende 90 secondi.

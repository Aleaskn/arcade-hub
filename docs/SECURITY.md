# Sicurezza, privacy e retention

## Controlli implementati

- Sessioni HMAC SHA-256 con TTL configurabile; secret minimo 32 caratteri in produzione.
- OAuth code scambiato soltanto dal Worker; token Discord e client secret non vengono inviati al frontend o registrati nei log.
- Verifica server-side di profilo e appartenenza alla guild dichiarata.
- Demo disabilitata per default nel deploy; `DEMO_MODE=true` viene aggiunto soltanto ai comandi locali.
- Ticket socket firmato e valido 45 secondi; accesso limitato allo scope guild+instance.
- Zod su protocollo, limiti messaggio 16 KiB, rate-limit HTTP best-effort e rate-limit per socket.
- Ruolo, turno, cella/colonna, risultato e spettatore sono controllati nel Durable Object.
- Deduplica persistente `commandId`, revisione monotona e chiave D1 `matchId` univoca.
- CORS a allow-list; in produzione l'app usa stessa origin. Nessuno stack trace viene restituito.
- `NEW_LOBBIES_ENABLED=false` sospende nuove lobby quando quote o incidenti lo richiedono.

Il rate-limit HTTP in memoria è una prima barriera per isolate, non un WAF globale. Prima di un rilascio pubblico più ampio va aggiunto Cloudflare Rate Limiting o un equivalente compatibile con il piano scelto.

## Dati raccolti

Arcade Hub conserva ID applicativo Discord o demo, nome mostrato più recente, guild scope, gioco, partecipanti, esito, rating e timestamp. Non conserva email, messaggi, contatti, OAuth code, access token o client secret. Lo stato live della stanza scade dopo 24 ore di inattività quando non vi sono connessioni.

## Retention e cancellazione

Una policy operativa consigliata è conservare storico e ranking per 180 giorni e poi aggregare o cancellare. Non è attivata automaticamente nell'MVP per evitare cancellazioni inattese. L'amministratore può:

```bash
wrangler d1 execute arcade-hub --remote --command "DELETE FROM match_players WHERE user_id = 'discord:ID'; DELETE FROM rankings WHERE user_id = 'discord:ID'; DELETE FROM users WHERE id = 'discord:ID';"
```

Prima della cancellazione occorre gestire i riferimenti in `matches` secondo la policy (anonimizzare o eliminare i match coinvolti) e fare un backup/Time Travel D1. Per azzerare una classifica di guild e gioco usare un comando parametrizzato o una procedura amministrativa autenticata; non esiste un endpoint pubblico di reset.

## Limiti noti

- L'`instanceId` proviene dal contesto SDK e serve come isolamento effimero; l'appartenenza alla guild è verificata separatamente via OAuth.
- Il test locale non dimostra resistenza a DDoS né capacità produttiva garantita.
- La disponibilità dipende da Discord e Cloudflare e dalle quote del piano attivo.

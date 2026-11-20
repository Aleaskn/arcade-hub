import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppSession, GameKind, LeaderboardEntry, MatchHistoryEntry, RoomSummary } from "@arcade-hub/shared";
import { Activity, Clock3, Copy, Crown, Plus, RefreshCw, Swords, Users } from "lucide-react";
import { api } from "../../lib/api";

const games: Array<{ id: GameKind; name: string; short: string; description: string; accent: string }> = [
  { id: "tris", name: "Tris", short: "3×3", description: "Il classico duello di X e O.", accent: "violet" },
  { id: "connect3", name: "Forza 3", short: "5×4", description: "Tre pedine in fila. Ritmo rapido.", accent: "cyan" },
  { id: "connect4", name: "Forza 4", short: "7×6", description: "Strategia verticale, quattro in fila.", accent: "amber" }
];

export function HomeScreen({ session }: { session: AppSession }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameKind>("tris");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextRooms, entries, matches] = await Promise.all([api.rooms(session.token), api.leaderboard(session.token, selectedGame), api.history(session.token)]);
      setRooms(nextRooms); setLeaderboard(entries); setHistory(matches);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Caricamento non riuscito"); }
    finally { setLoading(false); }
  }, [session.token, selectedGame]);
  useEffect(() => { void load(); }, [load]);

  const createRoom = async (game: GameKind) => {
    setError(null);
    try { void navigate(`/room/${await api.createRoom(session.token, game)}`, { state: { role: "player" } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Creazione non riuscita"); }
  };

  return (
    <div className="page home-page">
      <section className="hero-panel">
        <div><p className="eyebrow"><span className="status-dot" /> LOBBY ATTIVA</p><h1>Che cosa giochiamo?</h1><p>Crea una stanza o raggiungi una sfida già aperta nella tua sessione.</p></div>
        <form className="join-code" onSubmit={(event) => { event.preventDefault(); if (joinCode.length === 6) void navigate(`/room/${joinCode.toUpperCase()}`); }}>
          <label htmlFor="room-code">Hai un codice?</label><div><input id="room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/[^a-z0-9]/giu, "").slice(0, 6).toUpperCase())} placeholder="ABC123" /><button className="secondary-button">Entra</button></div>
        </form>
      </section>

      {error && <p className="error-banner" role="alert">{error}</p>}
      <section aria-labelledby="games-title"><div className="section-title"><div><p className="eyebrow">SCEGLI IL GIOCO</p><h2 id="games-title">Nuova partita</h2></div></div>
        <div className="game-grid">{games.map((game) => <article key={game.id} className={`game-card ${game.accent}`}><div className="game-symbol" aria-hidden="true">{game.id === "tris" ? "× ○" : "●"}</div><span className="game-size">{game.short}</span><h3>{game.name}</h3><p>{game.description}</p><button className="primary-button" onClick={() => void createRoom(game.id)}><Plus size={18} /> Crea stanza</button></article>)}</div>
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="rooms-title"><div className="panel-header"><div><p className="eyebrow">IN QUESTA SESSIONE</p><h2 id="rooms-title">Stanze aperte</h2></div><button className="icon-button" onClick={() => void load()} aria-label="Aggiorna stanze"><RefreshCw size={18} /></button></div>
          {loading ? <div className="empty-state"><span className="spinner" /> Cerco sfide…</div> : rooms.length === 0 ? <div className="empty-state"><Swords size={30} /><strong>Nessuna stanza ancora</strong><span>Creane una: comparirà qui per gli altri giocatori.</span></div> : <div className="room-list">{rooms.map((room) => <article key={room.roomId} className="room-row"><span className={`game-chip ${room.game}`}>{room.game === "tris" ? "TR" : room.game === "connect3" ? "F3" : "F4"}</span><div><strong>{room.hostName}</strong><small>{room.status === "lobby" ? "In attesa" : room.status === "playing" ? "Partita in corso" : "Conclusa"} · {room.roomId}</small></div><span className="count"><Users size={15} /> {room.players}/2</span><button className="secondary-button compact" onClick={() => navigate(`/room/${room.roomId}`)}>Apri</button></article>)}</div>}
        </section>

        <section className="panel" aria-labelledby="ranking-title"><div className="panel-header"><div><p className="eyebrow">CLASSIFICA GUILD</p><h2 id="ranking-title">Migliori giocatori</h2></div><select aria-label="Gioco classifica" value={selectedGame} onChange={(event) => setSelectedGame(event.target.value as GameKind)}>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></div>
          {leaderboard.length === 0 ? <div className="empty-state"><Crown size={30} /><strong>Classifica vuota</strong><span>Completa la prima partita per inaugurarla.</span></div> : <ol className="leaderboard">{leaderboard.slice(0, 8).map((entry, index) => <li key={entry.userId}><span className="rank">{index + 1}</span><span className="profile-dot small">{entry.displayName[0]?.toUpperCase()}</span><div><strong>{entry.displayName}</strong><small>{entry.won} V · {entry.lost} S · {entry.drawn} P</small></div><b>{entry.rating}</b></li>)}</ol>}
        </section>
      </div>

      <section className="panel history-panel"><div className="panel-header"><div><p className="eyebrow">ULTIMI RISULTATI</p><h2>Storico</h2></div><Activity size={20} /></div>{history.length === 0 ? <div className="empty-inline"><Clock3 size={18} /> Nessuna partita completata.</div> : <div className="history-list">{history.slice(0, 8).map((match) => <div key={match.matchId}><span>{games.find((g) => g.id === match.game)?.name}</span><strong>{match.players.map((p) => p.displayName).join(" vs ")}</strong><small>{match.winnerId ? `Vince ${match.players.find((p) => p.userId === match.winnerId)?.displayName ?? "—"}` : "Pareggio"}</small></div>)}</div>}</section>
      <button className="copy-scope" onClick={() => void navigator.clipboard.writeText("demo-instance")}><Copy size={14} /> Demo locale: apri una seconda scheda e usa un altro nome</button>
    </div>
  );
}

import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { AppSession } from "@arcade-hub/shared";
import { Check, CircleDot, Copy, Eye, Home, Play, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useRoomSocket } from "../../lib/useRoomSocket";

export function RoomScreen({ session }: { session: AppSession }) {
  const { roomId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const role = ((location.state as { role?: "player" | "spectator" } | null)?.role ?? "player");
  const { snapshot, connection, error, clearError, send } = useRoomSocket(session, roomId.toUpperCase(), role);
  const me = snapshot?.participants.find((participant) => participant.user.id === session.user.id);
  const players = useMemo(() => snapshot?.participants.filter((participant) => participant.role === "player").sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9)) ?? [], [snapshot]);
  const myTurn = snapshot?.gameState?.currentPlayerId === session.user.id;
  const canMove = connection === "online" && me?.role === "player" && myTurn && snapshot?.status === "playing";
  const statusText = !snapshot ? "Caricamento stanza…" : snapshot.status === "lobby" ? "Preparazione partita" : snapshot.status === "playing" ? (myTurn ? "Tocca a te" : `Turno di ${players.find((p) => p.user.id === snapshot.gameState?.currentPlayerId)?.user.displayName ?? "avversario"}`) : snapshot.gameState?.winnerId ? `${players.find((p) => p.user.id === snapshot.gameState?.winnerId)?.user.displayName ?? "Un giocatore"} ha vinto` : "Pareggio";

  return (
    <div className="page room-page">
      <div className="room-toolbar"><button className="secondary-button compact" onClick={() => navigate("/")}><Home size={17} /> Lobby</button><div className="room-code"><small>CODICE STANZA</small><button onClick={() => void navigator.clipboard.writeText(roomId)}>{roomId} <Copy size={15} /></button></div><span className={`connection ${connection}`}>{connection === "online" ? <Wifi size={16} /> : <WifiOff size={16} />}{connection === "online" ? "Connesso" : connection === "reconnecting" ? "Riconnessione…" : "Connessione…"}</span></div>
      {error && <button className="error-banner dismissible" onClick={clearError} role="alert">{error} <span>Chiudi</span></button>}
      <div className="room-layout">
        <aside className="room-sidebar panel"><p className="eyebrow">PRESENZE</p><h2>Giocatori</h2><div className="participants">{[0,1].map((slot) => { const player = players.find((item) => item.slot === slot); return <div className={`participant ${player?.ready ? "ready" : ""}`} key={slot}>{player ? <><span className="profile-dot">{player.user.displayName[0]?.toUpperCase()}</span><div><strong>{player.user.displayName}{player.user.id === session.user.id ? " (tu)" : ""}</strong><small>{player.connected ? player.ready ? "Pronto" : "In attesa" : "Disconnesso — slot riservato"}</small></div>{player.ready && <Check size={18} />}</> : <><span className="empty-avatar">?</span><div><strong>Posto libero</strong><small>In attesa di un giocatore</small></div></>}</div>; })}</div>
          <div className="spectators"><Eye size={17} /><span>{snapshot?.participants.filter((p) => p.role === "spectator").length ?? 0} spettatori</span></div>
          {snapshot?.status === "lobby" && me?.role === "player" && <button className={me.ready ? "secondary-button wide" : "primary-button wide"} onClick={() => send("room.ready", { ready: !me.ready })}>{me.ready ? "Non sono pronto" : "Sono pronto"}</button>}
          {snapshot?.status === "lobby" && snapshot.hostId === session.user.id && <button className="primary-button wide start" disabled={players.length !== 2 || players.some((p) => !p.ready)} onClick={() => send("room.start")}><Play size={18} /> Inizia partita</button>}
          {snapshot?.status === "finished" && me?.role === "player" && <button className="primary-button wide" onClick={() => send("game.rematch", { accept: true })}><RefreshCw size={18} /> {snapshot.rematchVotes.includes(session.user.id) ? "Rivincita richiesta" : "Chiedi rivincita"}</button>}
        </aside>
        <section className="game-stage panel" aria-labelledby="game-status"><div className="game-heading"><div><p className="eyebrow">{snapshot?.game === "tris" ? "TRIS · 3×3" : snapshot?.game === "connect3" ? "FORZA 3 · 5×4" : "FORZA 4 · 7×6"}</p><h1 id="game-status">{statusText}</h1></div>{me?.role === "spectator" && <span className="spectator-pill"><Eye size={15} /> Spettatore</span>}</div>
          {!snapshot?.gameState ? <WaitingArena readyCount={players.filter((p) => p.ready).length} /> : snapshot.game === "tris" ? <TrisBoard snapshot={snapshot} players={players} canMove={canMove} move={(position) => send("game.move", { position })} /> : <ConnectBoard snapshot={snapshot} players={players} canMove={canMove} move={(column) => send("game.move", { column })} />}
          <p className="turn-announcement" aria-live="polite"><CircleDot size={16} /> {statusText}</p>
        </section>
      </div>
    </div>
  );
}

function WaitingArena({ readyCount }: { readyCount: number }) { return <div className="waiting-arena"><div className="orbit"><span /><span /></div><h3>La sfida sta per cominciare</h3><p>{readyCount}/2 giocatori pronti</p><div className="ready-track"><i style={{ width: `${readyCount * 50}%` }} /></div></div>; }

type Player = NonNullable<ReturnType<typeof useRoomSocket>["snapshot"]>["participants"][number];
function markFor(id: string | null, players: Player[]): string { return id === players[0]?.user.id ? "X" : id === players[1]?.user.id ? "O" : ""; }

function TrisBoard({ snapshot, players, canMove, move }: { snapshot: NonNullable<ReturnType<typeof useRoomSocket>["snapshot"]>; players: Player[]; canMove: boolean; move: (position: number) => void }) {
  return <div className="tris-board" role="grid" aria-label="Tabellone Tris">{snapshot.gameState?.board.map((cell, index) => <button key={index} role="gridcell" className={`${cell ? `mark-${markFor(cell, players).toLowerCase()}` : ""} ${snapshot.gameState?.lastMove === index ? "last-move" : ""}`} disabled={!canMove || cell !== null} onClick={() => move(index)} aria-label={cell ? `Cella ${index + 1}: ${markFor(cell, players)}` : `Cella ${index + 1}: vuota`}>{markFor(cell, players)}</button>)}</div>;
}

function ConnectBoard({ snapshot, players, canMove, move }: { snapshot: NonNullable<ReturnType<typeof useRoomSocket>["snapshot"]>; players: Player[]; canMove: boolean; move: (column: number) => void }) {
  const game = snapshot.gameState!;
  return <div className="connect-wrap"><div className="column-controls" style={{ gridTemplateColumns: `repeat(${game.width}, 1fr)` }}>{Array.from({ length: game.width }, (_, column) => <button key={column} disabled={!canMove || game.board[column] !== null} onClick={() => move(column)} aria-label={`Inserisci pedina nella colonna ${column + 1}`}><span>↓</span></button>)}</div><div className="connect-board" role="grid" aria-label={`Tabellone ${game.width} per ${game.height}`} style={{ gridTemplateColumns: `repeat(${game.width}, 1fr)` }}>{game.board.map((cell, index) => <div role="gridcell" aria-label={cell ? `Pedina ${markFor(cell, players)}` : "Cella vuota"} className={snapshot.gameState?.lastMove === index ? "last-move" : ""} key={index}><i className={cell ? `disc player-${markFor(cell, players).toLowerCase()}` : "disc"} /></div>)}</div></div>;
}

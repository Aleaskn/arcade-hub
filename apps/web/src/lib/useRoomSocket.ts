import { useCallback, useEffect, useRef, useState } from "react";
import { clientCommandSchema, roomSnapshotSchema, serverEventSchema, PROTOCOL_VERSION, type AppSession, type ClientCommand, type RoomSnapshot } from "@arcade-hub/shared";
import { api, socketUrl } from "./api";

export type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";

export function useRoomSocket(session: AppSession, roomId: string, role: "player" | "spectator") {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let attempt = 0;
    let reconnectTimer: number | undefined;
    const connect = async () => {
      setConnection(attempt === 0 ? "connecting" : "reconnecting");
      try {
        const ticket = await api.socketTicket(session.token, roomId);
        if (stoppedRef.current) return;
        const socket = new WebSocket(socketUrl(roomId, ticket, role));
        socketRef.current = socket;
        socket.addEventListener("open", () => { attempt = 0; setConnection("online"); setError(null); });
        socket.addEventListener("message", (event) => {
          const parsed = serverEventSchema.safeParse(JSON.parse(String(event.data)));
          if (!parsed.success) return;
          if (parsed.data.type === "error") setError(parsed.data.payload.message);
          else {
            const nextSnapshot = roomSnapshotSchema.safeParse(parsed.data.payload);
            if (nextSnapshot.success) setSnapshot((current) => !current || parsed.data.revision >= current.revision ? nextSnapshot.data : current);
          }
        });
        socket.addEventListener("close", () => {
          if (stoppedRef.current) return;
          attempt += 1;
          setConnection("reconnecting");
          reconnectTimer = window.setTimeout(() => void connect(), Math.min(8000, 500 * 2 ** attempt));
        });
        socket.addEventListener("error", () => setError("Connessione alla stanza interrotta"));
      } catch (cause) {
        if (stoppedRef.current) return;
        attempt += 1;
        setError(cause instanceof Error ? cause.message : "Connessione non riuscita");
        reconnectTimer = window.setTimeout(() => void connect(), Math.min(8000, 500 * 2 ** attempt));
      }
    };
    void connect();
    return () => {
      stoppedRef.current = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close(1000, "Navigazione");
    };
  }, [session.token, roomId, role]);

  const send = useCallback((type: ClientCommand["type"], payload: Record<string, unknown> = {}) => {
    const command = { version: PROTOCOL_VERSION, type, roomId, commandId: crypto.randomUUID(), payload };
    const parsed = clientCommandSchema.safeParse(command);
    if (!parsed.success) { setError("Comando locale non valido"); return; }
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError("Connessione non pronta"); return; }
    socketRef.current.send(JSON.stringify(parsed.data));
  }, [roomId]);

  return { snapshot, connection, error, clearError: () => setError(null), send };
}

import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { AppSession } from "@arcade-hub/shared";
import { Gamepad2, LogOut, Radio, ShieldCheck } from "lucide-react";
import { DemoAuthAdapter, DiscordAuthAdapter, loadSession, saveSession } from "../lib/auth";
import { LoginScreen } from "../features/lobby/LoginScreen";
import { HomeScreen } from "../features/lobby/HomeScreen";
import { RoomScreen } from "../features/game/RoomScreen";

export function App() {
  const [session, setSession] = useState<AppSession | null>(() => loadSession());
  const navigate = useNavigate();
  const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
  const adapter = useMemo(() => discordClientId ? new DiscordAuthAdapter(discordClientId) : new DemoAuthAdapter(), [discordClientId]);

  useEffect(() => { saveSession(session); }, [session]);

  if (!session) return <LoginScreen adapter={adapter} onLogin={setSession} />;
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("/")} aria-label="Torna alla lobby">
          <span className="brand-mark"><Gamepad2 aria-hidden="true" /></span>
          <span><b>ARCADE</b> HUB</span>
        </button>
        <div className="topbar-actions">
          <span className="mode-pill"><ShieldCheck size={15} /> {session.user.demo ? "DEMO — identità simulata" : "Discord verificato"}</span>
          <span className="profile-dot">{session.user.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="profile-name">{session.user.displayName}</span>
          <button className="icon-button" aria-label="Esci" title="Esci" onClick={() => { setSession(null); void navigate("/"); }}><LogOut size={19} /></button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomeScreen session={session} />} />
          <Route path="/room/:roomId" element={<RoomScreen session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <div className="live-region" aria-live="polite"><Radio size={14} /> Arcade Hub pronto</div>
    </div>
  );
}

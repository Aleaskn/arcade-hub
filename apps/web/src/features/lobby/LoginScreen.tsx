import { useEffect, useState } from "react";
import type { AppSession } from "@arcade-hub/shared";
import { Gamepad2, LockKeyhole, Users } from "lucide-react";
import type { AuthAdapter } from "../../lib/auth";

export function LoginScreen({ adapter, onLogin }: { adapter: AuthAdapter; onLogin: (session: AppSession) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = async () => {
    setLoading(true); setError(null);
    try { onLogin(await adapter.login(name)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Accesso non riuscito"); setLoading(false); }
  };
  useEffect(() => { if (adapter.mode === "discord") void login(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-logo"><Gamepad2 size={34} /></div>
        <p className="eyebrow">SALA GIOCHI PRIVATA</p>
        <h1><span>ARCADE</span> HUB</h1>
        <p className="login-lead">Sfida gli amici. Una mossa alla volta.</p>
        {adapter.mode === "demo" ? (
          <form onSubmit={(event) => { event.preventDefault(); void login(); }}>
            <div className="demo-notice"><LockKeyhole size={18} /><div><strong>Modalità demo locale</strong><small>L’identità è simulata e vale soltanto su questo dispositivo.</small></div></div>
            <label htmlFor="demo-name">Il tuo nome di prova</label>
            <input id="demo-name" autoFocus autoComplete="off" maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="es. Giulia" />
            <button className="primary-button wide" disabled={loading || !name.trim()}>{loading ? "Ingresso…" : "Entra nella lobby"}</button>
          </form>
        ) : <div className="loading-panel"><span className="spinner" /> Connessione a Discord…</div>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        <div className="login-meta"><span><Users size={16} /> 2 giocatori + spettatori</span><span>Tris · Forza 3 · Forza 4</span></div>
      </section>
    </main>
  );
}

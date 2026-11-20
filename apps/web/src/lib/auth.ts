import { DiscordSDK } from "@discord/embedded-app-sdk";
import type { AppSession } from "@arcade-hub/shared";
import { api } from "./api";

export interface AuthAdapter {
  readonly mode: "demo" | "discord";
  login(displayName?: string): Promise<AppSession>;
}

export class DemoAuthAdapter implements AuthAdapter {
  readonly mode = "demo" as const;
  async login(displayName?: string): Promise<AppSession> {
    if (!displayName) throw new Error("Scegli un nome demo");
    const key = "arcade-hub-device-id";
    let deviceId = sessionStorage.getItem(key);
    if (!deviceId) { deviceId = crypto.randomUUID(); sessionStorage.setItem(key, deviceId); }
    return api.demoLogin(displayName, deviceId);
  }
}

export class DiscordAuthAdapter implements AuthAdapter {
  readonly mode = "discord" as const;
  constructor(private readonly clientId: string) {}
  async login(): Promise<AppSession> {
    const sdk = new DiscordSDK(this.clientId);
    await sdk.ready();
    const { code } = await sdk.commands.authorize({ client_id: this.clientId, response_type: "code", state: crypto.randomUUID(), prompt: "none", scope: ["identify", "guilds"] });
    return api.discordExchange(code, sdk.guildId, sdk.instanceId);
  }
}

export function loadSession(): AppSession | null {
  const raw = sessionStorage.getItem("arcade-hub-session");
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AppSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}

export function saveSession(session: AppSession | null): void {
  if (session) sessionStorage.setItem("arcade-hub-session", JSON.stringify(session));
  else sessionStorage.removeItem("arcade-hub-session");
}

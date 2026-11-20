import type { Env, SessionClaims } from "../env";

interface DiscordTokenResponse { access_token?: string; token_type?: string; expires_in?: number; error?: string }
interface DiscordUserResponse { id?: string; username?: string; global_name?: string | null }
interface DiscordGuildResponse { id?: string }

export async function exchangeDiscordCode(env: Env, code: string, guildId: string | null, instanceId: string): Promise<Omit<SessionClaims, "exp">> {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) throw new Error("OAuth Discord non configurato");
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code })
  });
  if (!tokenResponse.ok) throw new Error("Scambio OAuth Discord rifiutato");
  const token = await tokenResponse.json<DiscordTokenResponse>();
  if (!token.access_token) throw new Error("Token Discord assente");
  const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!userResponse.ok) throw new Error("Identità Discord non verificabile");
  const user = await userResponse.json<DiscordUserResponse>();
  if (!user.id || !user.username) throw new Error("Profilo Discord incompleto");
  if (guildId) {
    const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!guildsResponse.ok) throw new Error("Guild Discord non verificabile");
    const guilds = await guildsResponse.json<DiscordGuildResponse[]>();
    if (!guilds.some((guild) => guild.id === guildId)) throw new Error("Utente non appartenente alla guild dichiarata");
  }
  return {
    sub: `discord:${user.id}`,
    name: (user.global_name || user.username).slice(0, 32),
    demo: false,
    guildId: guildId ? `guild:${guildId}` : `dm:${instanceId}`,
    instanceId
  };
}

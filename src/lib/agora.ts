import { RtcRole, RtcTokenBuilder } from "agora-token";
import { fail } from "./auth";

const TOKEN_TTL_SEC = 2 * 60 * 60;

/** Server-only. The certificate never leaves this module. */
export function buildRtcToken(channelName: string, uid: number) {
  const appId = process.env.AGORA_APP_ID;
  const cert = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !cert) throw fail(503, "Video isn't configured yet (AGORA_APP_ID / AGORA_APP_CERTIFICATE).");
  const token = RtcTokenBuilder.buildTokenWithUid(appId, cert, channelName, uid, RtcRole.PUBLISHER, TOKEN_TTL_SEC, TOKEN_TTL_SEC);
  return { appId, token, expiresAt: new Date(Date.now() + TOKEN_TTL_SEC * 1000).toISOString() };
}

/** Stable numeric uid per user so reconnects replace the old publisher instead of duplicating it. */
export function uidFor(userId: string) {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 2_000_000_000) + 1; // avoid 0 (Agora treats it as "assign one for me")
}

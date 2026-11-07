// Public settings, baked in at build time. Nothing secret lives here.
// The public town by default, so a fresh clone can watch the live game; set it to "" for an
// offline-only build.
export const GAME_ID = process.env.NEXT_PUBLIC_GAME_ID ?? "town.slaythebear.testnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.fastnear.com";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet.nearblocks.io";
export const ROOT_ACCOUNT = process.env.NEXT_PUBLIC_ROOT_ACCOUNT ?? "slaythebear.testnet";
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/vibe-code-guy/slay-the-bear";
export const LIVE_AVAILABLE = GAME_ID !== "";

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

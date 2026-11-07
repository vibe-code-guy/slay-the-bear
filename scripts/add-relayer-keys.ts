// Add extra full-access keys to the relayer (root) account, so the web app can relay several
// moves at once without nonce clashes. Keys go to ~/.near-credentials/testnet/<root>.relayer-keys.json.
//   npx tsx scripts/add-relayer-keys.ts [--root slaythebear.testnet] [--count 3]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KeyPair, actions } from "near-api-js";
import { account, arg, credentialsDir, txHash } from "./lib/near";

export function relayerKeysPath(root: string): string {
  return join(credentialsDir(), `${root}.relayer-keys.json`);
}

export function loadRelayerKeys(root: string): string[] {
  const p = relayerKeysPath(root);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as string[]) : [];
}

if (process.argv[1]?.endsWith("add-relayer-keys.ts")) {
  const root = arg("root", "slaythebear.testnet");
  const count = Number(arg("count", "3"));
  const existing = loadRelayerKeys(root);
  const fresh = Array.from({ length: count }, () => KeyPair.fromRandom("ed25519"));
  // Save first, so a key on chain is never lost.
  writeFileSync(relayerKeysPath(root), JSON.stringify([...existing, ...fresh.map((k) => k.toString())], null, 2), { mode: 0o600 });
  const res = await account(root).signAndSendTransaction({
    receiverId: root,
    actions: fresh.map((k) => actions.addFullAccessKey(k.getPublicKey())),
  });
  console.log(`added ${count} relayer keys to ${root} (${txHash(res)}); ${existing.length + count} extra keys in ${relayerKeysPath(root)}`);
}

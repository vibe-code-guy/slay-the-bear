// slay: play Slay the Bear from a terminal. `slay sim ...` plays the offline town, `slay live ...`
// the game on NEAR testnet; `--json` prints one JSON object for agents. See src/help.ts.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flagString, parseArgs, type Args } from "./args";
import * as cmd from "./commands";
import { fail, usage, type Out } from "./commands";
import { slayText } from "./format";
import { HELP } from "./help";
import { renderStatus, statusModel } from "./report";
import type { Mode, Session } from "./session";
import { SimSession } from "./sim";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const COMMANDS: Record<string, (s: Session, a: Args) => Promise<Out>> = {
  status: cmd.status,
  look: cmd.status,
  hit: cmd.hit,
  wait: cmd.wait,
  settle: cmd.settle,
  spin: cmd.settle,
  claim: cmd.claim,
  me: cmd.me,
  inventory: cmd.me,
  craft: cmd.craft,
  forge: cmd.craft,
  smith: cmd.smith,
  market: cmd.market,
  sell: cmd.sell,
  buy: cmd.buy,
  cancel: cmd.cancel,
  feed: cmd.feed,
  raids: cmd.raids,
  history: cmd.raids,
  verify: cmd.verify,
  rules: cmd.rules,
};

const homeOf = (a: Args) => resolve(flagString(a, "home") ?? process.env.SLAY_HOME ?? join(REPO, ".slay"));

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

function newTown(home: string, a: Args): SimSession | Out {
  const seed = flagString(a, "seed") !== undefined ? Number(flagString(a, "seed")) : randomSeed();
  const minutes = flagString(a, "minutes") !== undefined ? Number(flagString(a, "minutes")) : 5;
  if (!Number.isInteger(seed) || seed < 0) return usage(null, "sim new [--seed n] [--minutes m]", "the seed is a whole number");
  if (!(minutes >= 1 && minutes <= 60)) return usage(null, "sim new [--seed n] [--minutes m]", "a raid lasts 1 to 60 minutes");
  return SimSession.create(home, { seed, roundSecs: Math.round(minutes * 60) });
}

/** Runs one command; nothing is printed here. */
export async function run(argv: string[], homeOverride?: string): Promise<{ out: Out; mode?: Mode; command: string }> {
  const a = parseArgs(argv);
  const [mode, command = "status", ...rest] = a.positional;
  const args: Args = { positional: rest, flags: a.flags };
  const home = homeOverride ?? homeOf(a);
  const helpOut: Out = { ok: true, json: { help: HELP }, text: [HELP] };
  if (!mode || mode === "help" || a.flags.help) return { out: helpOut, command: "help" };
  if (mode !== "sim" && mode !== "live") {
    return { out: usage(null, "<sim|live> <command>", `\`slay sim ${mode}\` plays offline, \`slay live ${mode}\` on NEAR testnet; \`slay help\` lists the commands`), command: mode };
  }

  if (mode === "sim") {
    if (command === "demo") return { out: await demo(), mode, command };
    let started: SimSession | null = null;
    let s: SimSession;
    if (command === "new") {
      const made = newTown(home, args);
      if (!(made instanceof SimSession)) return { out: made, mode, command };
      s = made;
      started = made;
    } else {
      const loaded = SimSession.load(home);
      if (loaded) s = loaded;
      else {
        s = SimSession.create(home, { seed: randomSeed(), roundSecs: 300 });
        started = s;
      }
    }
    try {
      let out: Out;
      if (command === "new") {
        const m = statusModel(s, await s.snapshot());
        out = { ok: true, json: { status: m }, text: renderStatus(m) };
      } else {
        const fn = COMMANDS[command];
        out = fn ? await fn(s, args) : usage(s, "<command>", `unknown command ${command}; \`slay help\` lists them`);
      }
      if (started) {
        const intro = `Started a new offline town (seed ${started.seed}, ${Number(started.config.roundSecs) / 60}-minute raids). You joined with a ${slayText(started.config.pouchAmount)} $SLAY starter pouch. Time only moves when you \`slay sim wait\`.`;
        out = { ...out, json: { started: { seed: started.seed, raidSeconds: Number(started.config.roundSecs) }, ...out.json }, text: [intro, "", ...out.text] };
      }
      return { out, mode, command };
    } finally {
      s.close();
    }
  }

  const { LiveSession } = await import("./live");
  const s = await LiveSession.open(home, { game: flagString(args, "game"), rpc: flagString(args, "rpc") });
  if (command === "join") {
    const res = await s.join({ site: flagString(args, "site"), account: flagString(args, "account"), fresh: !!args.flags.new });
    if (!res.ok) return { out: fail(s, res.error ?? "", "join"), mode, command };
    const m = statusModel(s, await s.snapshot());
    const who = res.kind === "guest" ? "a guest account; its key stays on this machine" : "your own account";
    const intro = res.already
      ? `You are already in town as ${res.accountId}. (\`slay live join --new --site <url>\` makes another guest.)`
      : `Joined ${s.contractId} as ${res.accountId} (${who})${res.pouch ? `, with a ${slayText(s.config.pouchAmount)} $SLAY starter pouch` : "; its starter pouch was claimed before"}.`;
    return { out: { ok: true, json: { result: { account: res.accountId, kind: res.kind, already: !!res.already }, status: m }, text: [intro, "", ...renderStatus(m)] }, mode, command };
  }
  if (command === "leave") {
    const id = s.me();
    s.leave();
    return { out: { ok: true, json: { result: { forgot: id } }, text: [id ? `Forgot the local key of ${id}. The account stays on testnet.` : "Nobody to forget."] }, mode, command };
  }
  const fn = COMMANDS[command];
  return { out: fn ? await fn(s, args) : usage(s, "<command>", `unknown command ${command}; \`slay help\` lists them`), mode, command };
}

/** One whole raid in a scratch town, printed as the commands and what they show. */
async function demo(): Promise<Out> {
  const home = mkdtempSync(join(tmpdir(), "slay-demo-"));
  const script = [
    ["sim", "new", "--seed", "7"],
    ["sim", "hit", "300"],
    ["sim", "wait", "45"],
    ["sim", "hit", "200"],
    ["sim", "wait", "end"],
    ["sim", "settle"],
    ["sim", "claim"],
    ["sim", "verify"],
  ];
  const text: string[] = ["A whole offline raid, command by command (a scratch town; your saved one is untouched).", ""];
  const steps: unknown[] = [];
  try {
    for (const argv of script) {
      const { out } = await run(argv, home);
      text.push(`$ slay ${argv.join(" ")}`, ...out.text, "");
      steps.push({ command: `slay ${argv.join(" ")}`, ok: out.ok, ...out.json });
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
  return { ok: true, json: { steps }, text };
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  try {
    const { out, mode, command } = await run(argv);
    if (json) console.log(JSON.stringify({ ok: out.ok, mode: mode ?? null, command, ...out.json }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    else console.log(out.text.join("\n"));
    process.exitCode = out.exitCode ?? (out.ok ? 0 : 1);
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    if (json) console.log(JSON.stringify({ ok: false, error: "internal", message }, null, 2));
    else console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

await main();

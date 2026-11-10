# Deploying

How to run your own game instance, its helpers and the website. Testnet only: the scripts refuse
any other network.

## 1. Accounts

```bash
npx tsx scripts/faucet-account.ts --account <root>.testnet     # 10 NEAR from the public faucet
npx tsx scripts/faucet-topup.ts --to <root>.testnet --count 2  # optional: more NEAR via temporary faucet accounts
```

Keys are written to `~/.near-credentials/testnet/<account>.json` before any request, and never
to the repository.

## 2. The contract

```bash
npm run build:contract:reproducible      # needs Docker; or npm run build:contract for a local build
npx tsx scripts/deploy.ts --root <root>.testnet --name game --preset quick --near 10
npx tsx scripts/status.ts --game game.<root>.testnet
```

`deploy.ts` creates `<name>.<root>`, then deploys the wasm and calls `new()` in one transaction,
so nobody can initialise the contract first. Presets (`packages/rules/src/config.ts`): `quick`
(5-minute raids), `demo` (10 minutes), `season` (24 hours). It writes the code hash and the
transactions to `deployments/<game>.json`.

Lock it once you are satisfied. This deletes every key on the game account and cannot be
undone:

```bash
npx tsx scripts/lock.ts --game game.<root>.testnet             # dry run: lists the keys
npx tsx scripts/lock.ts --game game.<root>.testnet --confirm
```

Keep an unlocked instance (for example `--name dev --preset demo`) for testing changes.

Before the lock, a new build of the same contract source (for example after the repository
moves, since the contract embeds its source link) can replace the code and keep the state:

```bash
npx tsx scripts/redeploy.ts --game game.<root>.testnet             # dry run: shows the links inside the new wasm
npx tsx scripts/redeploy.ts --game game.<root>.testnet --confirm   # deploys, checks the state, updates deployments/
```
`scripts/retire.ts` deletes an unlocked instance and returns its NEAR, as long as its contract
data is under 10 kB (a NEAR limit).

## 3. Helpers

```bash
npx tsx scripts/setup-npcs.ts --root <root>.testnet          # keeper + four villagers, 0.5 NEAR each
npm run agents -- --game game.<root>.testnet --open-if-idle  # keeper and villagers in a loop
```

`--open-if-idle` lets a villager open a raid when none is running. Without it, villagers only
join raids that players start, which keeps contract storage growing with real play only.

## 4. The website

Local, against your instance:

```bash
npx tsx scripts/web-env.ts --game game.<root>.testnet   # writes apps/web/.env.local (gitignored)
npm run demo                                           # http://localhost:3000
```

Hosted on Vercel (free tier):

1. Import the repository. Root directory: `apps/web`. Framework: Next.js. Keep "Include files
   outside the root directory in the Build Step" on: the app imports `packages/rules` and
   `packages/agents`. Vercel installs the npm workspace from the repository's lockfile.
2. Environment variables, from `apps/web/.env.local` or `apps/web/.env.example`:
   `NEXT_PUBLIC_GAME_ID`, `NEXT_PUBLIC_ROOT_ACCOUNT`, `NEXT_PUBLIC_RPC_URL`,
   `RELAYER_ACCOUNT_ID`, `RELAYER_PRIVATE_KEY`, and optionally `KEEPER_ACCOUNT_ID`,
   `KEEPER_PRIVATE_KEY`, `VILLAGER_KEYS`, `GUEST_FUND_NEAR`. Mark the private keys as sensitive.
3. Deploy. Open pages call `/api/tick` every 20 seconds, which settles finished raids and lets
   the villagers act. For a heartbeat when nobody is watching, have a scheduler send a POST to
   `<site>/api/tick` every minute (for example a free job on cron-job.org; one a minute is
   about 43,000 of Hobby's million function calls a month). `.github/workflows/tick.yml` does
   the same every 5 minutes once the repository variable `SITE_URL` is set; Actions minutes are
   free only for public repositories.

The same from a clone with the Vercel CLI, without connecting the repository (this is how
`slay-the-bear.vercel.app` was first deployed; its project is now connected, so a push to `main`
deploys it):

```bash
vercel project add slay-the-bear
vercel project update slay-the-bear --root-directory apps/web --framework nextjs --node-version 24.x
vercel link --yes --project slay-the-bear
vercel env add RELAYER_PRIVATE_KEY production --sensitive   # and the other variables above
vercel deploy --prod
```

`.vercelignore` limits the upload to what the build needs: the tracked files of `apps/` and
`packages/` and the root manifests. Local secrets (`.env.local`, `.slay/`) and the contract's
build output stay on your machine; `vercel deploy --prod --dry --json` lists every file first.

The relayer account must be the root account: it creates guests as `p-<random>.<root>` and pays
their gas. Each guest costs it 0.01 NEAR plus about 0.0004 NEAR per move.

## 5. Checks

```bash
npm run verify:game -- --game game.<root>.testnet
npm run verify:live -- --game game.<root>.testnet
npx tsx scripts/e2e.ts --game dev.<root>.testnet           # needs tester and villager accounts
npx tsx scripts/test-web-flow.ts --url http://localhost:3000 --game game.<root>.testnet
npm run test:ui -- --url http://localhost:3000 --live
```

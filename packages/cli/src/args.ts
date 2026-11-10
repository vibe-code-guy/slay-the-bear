// A small argument parser: positional words, `--flag value`, `--flag=value` and `--switch`.
export interface Args {
  positional: string[];
  flags: Record<string, string | true>;
}

/** Flags that take a value. */
const VALUED = new Set(["weapon", "trophy", "seed", "minutes", "site", "account", "game", "rpc", "home"]);

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h") flags.help = true;
    else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) flags[key] = a.slice(eq + 1);
      else if (VALUED.has(key) && i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) flags[key] = argv[++i]!;
      else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

export const flagString = (a: Args, k: string): string | undefined => (typeof a.flags[k] === "string" ? (a.flags[k] as string) : undefined);

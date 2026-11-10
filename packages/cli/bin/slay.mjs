#!/usr/bin/env node
// The `slay` command. It runs the TypeScript source through tsx, so there is no build step.
import { register } from "tsx/esm/api";

register();
await import("../src/main.ts");

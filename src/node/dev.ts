/** `npm run dev`: game server (with reload) and web client together. Ctrl+C stops both. */
import { spawn } from "node:child_process";

const procs = [
  spawn("npx", ["tsx", "watch", "src/server/main.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite", "--config", "web/vite.config.ts"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", stop);

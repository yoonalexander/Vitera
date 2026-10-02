import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

// rustup can be installed without changing the user's global PATH.
const cargoBin = join(homedir(), ".cargo", "bin");
const env = { ...process.env };
// Node's built-in dotenv parser keeps development configuration in the native process.
// Existing process variables win; no secrets or settings are bundled into the webview.
if (existsSync(".env"))
  for (const [key, value] of Object.entries(
    parseEnv(readFileSync(".env", "utf8")),
  ))
    if (env[key] === undefined) env[key] = value;
const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
if (existsSync(cargoBin))
  env[pathKey] = `${cargoBin}${delimiter}${env[pathKey] ?? ""}`;
const args = process.argv.slice(2);
const testing = args[0] === "test";
const program = testing ? "cargo" : process.execPath;
const commandArgs = testing
  ? ["test", "--manifest-path", "src-tauri/Cargo.toml", ...args.slice(1)]
  : ["node_modules/@tauri-apps/cli/tauri.js", ...args];
const child = spawn(program, commandArgs, {
  env,
  stdio: "inherit",
  shell: false,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

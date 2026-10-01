import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

// rustup can be installed without changing the user's global PATH.
const cargoBin = join(homedir(), ".cargo", "bin");
const env = { ...process.env };
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

import { spawn } from "node:child_process";

const children = [];

function run(command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });
  return child;
}

run("npm", ["run", "dev"]);
run("npm", ["run", "voice:bridge"]);

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

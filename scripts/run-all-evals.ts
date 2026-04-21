import { spawn } from "node:child_process";

async function run(scriptPath: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptPath} exited with ${code}`));
      }
    });
  });
}

async function main() {
  await run("scripts/run-socrates-evals.ts");
  await run("scripts/run-message-intelligence-evals.ts");
}

void main();

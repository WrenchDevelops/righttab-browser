const { spawn } = require("child_process");
const electron = require("electron");
const executable = process.argv[2] || electron;
const args = process.argv[2] ? [] : ["."];
const child = spawn(executable, args, {
  stdio: ["inherit", "pipe", "pipe"],
  env: { ...process.env, RIGHTTAB_SCOUT_TEST: "1" },
});
let success = false;
const timeout = setTimeout(() => {
  child.kill("SIGKILL");
}, 45000);
child.stdout.on("data", (chunk) => {
  const output = chunk.toString();
  process.stdout.write(output);
  if (
    output.includes(
      "OK Creator Scout toolbar, native panel, settings, key guard, resize, and close",
    )
  ) {
    success = true;
    setTimeout(() => child.kill("SIGKILL"), 500);
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  clearTimeout(timeout);
  process.exit(success ? 0 : (code ?? 1));
});

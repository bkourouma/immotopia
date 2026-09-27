const { spawnSync } = require("node:child_process");

const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});

if (gitRoot.status !== 0) {
  process.exit(0);
}

const hooksPath = spawnSync(
  "git",
  ["config", "--local", "--get", "core.hooksPath"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
);

// Migrate only the value Husky 9 wrote; preserve any custom hooks path.
if (hooksPath.status === 0 && hooksPath.stdout.trim() === ".husky/_") {
  const unset = spawnSync(
    "git",
    ["config", "--local", "--unset-all", "core.hooksPath"],
    { stdio: "inherit" },
  );
  if (unset.status !== 0) {
    process.exit(unset.status ?? 1);
  }
}

const install = spawnSync("lefthook", ["install"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (install.error) {
  console.error(`Could not install Lefthook: ${install.error.message}`);
  process.exit(1);
}

process.exit(install.status ?? 1);

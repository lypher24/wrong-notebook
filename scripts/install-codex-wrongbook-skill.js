const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "codex-skills", "cherry-wrong-book");
const codexHome = process.env.CODEX_HOME
  ? path.resolve(process.env.CODEX_HOME)
  : path.join(os.homedir(), ".codex");
const targetDir = path.join(codexHome, "skills", "cherry-wrong-book");

if (!fs.existsSync(sourceDir)) {
  console.error(JSON.stringify({ status: "error", message: `缺少 skill 源目录: ${sourceDir}` }));
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetDir), { recursive: true });
fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(
  JSON.stringify({
    status: "installed",
    sourceDir,
    targetDir,
  })
);

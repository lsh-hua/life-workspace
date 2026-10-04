// 桌面包构建：Next standalone → 组装 Electron 运行目录 → NSIS 安装器。
// 直接复用已安装的 Electron 运行时，避开 electron-builder dir 在本机被实时防护拖死的问题。
// 输出目录：desktop-app/release/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "desktop-app");
const outDir = path.join(appDir, "release");
const unpacked = path.join(outDir, "win-unpacked");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });

console.log("[1/5] next build (webpack, standalone)...");
run("npx", ["next", "build", "--webpack"]);

console.log("[2/5] 组装 standalone 产物...");
const standalone = path.join(root, "desktop-build", "server");
fs.rmSync(path.join(root, "desktop-build"), { recursive: true, force: true });
fs.cpSync(path.join(root, ".next", "standalone"), standalone, { recursive: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}
// Next 文件追踪可能把本地数据库复制进 standalone；发布包绝不能携带用户数据。
fs.rmSync(path.join(standalone, "data"), { recursive: true, force: true });
// 迁移脚本与 SQL（放 server 内以复用其 node_modules 里的 @libsql/client）
fs.cpSync(path.join(root, "scripts", "migrate.mjs"), path.join(standalone, "migrate.mjs"));
fs.cpSync(path.join(root, "db", "migrations"), path.join(standalone, "migrations"), { recursive: true });
// standalone 追踪会漏掉 libsql 的原生平台包，手动补齐
const libsqlNative = path.join(standalone, "node_modules", "@libsql", "win32-x64-msvc");
if (!fs.existsSync(libsqlNative)) {
  fs.cpSync(path.join(root, "node_modules", "@libsql", "win32-x64-msvc"), libsqlNative, { recursive: true });
}

const forbiddenDatabaseFiles = [];
function findDatabaseFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findDatabaseFiles(fullPath);
    } else if (/\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
      forbiddenDatabaseFiles.push(fullPath);
    }
  }
}
findDatabaseFiles(standalone);
if (forbiddenDatabaseFiles.length > 0) {
  throw new Error(`构建中止：standalone 含数据库文件\n${forbiddenDatabaseFiles.join("\n")}`);
}

console.log("[3/5] 组装 Electron 运行目录...");
fs.rmSync(outDir, { recursive: true, force: true });
const electronDist = path.join(root, "node_modules", "electron", "dist");
if (!fs.existsSync(path.join(electronDist, "electron.exe"))) {
  throw new Error("缺少 Electron 运行时，请先执行 npm install");
}
fs.cpSync(electronDist, unpacked, { recursive: true });
fs.renameSync(path.join(unpacked, "electron.exe"), path.join(unpacked, "人生工作台.exe"));

console.log("[4/5] 复制桌面入口与 server...");
const targetApp = path.join(unpacked, "resources", "app");
fs.mkdirSync(targetApp, { recursive: true });
for (const file of ["main.cjs", "preload.cjs", "package.json"]) {
  fs.copyFileSync(path.join(appDir, file), path.join(targetApp, file));
}
fs.cpSync(standalone, path.join(targetApp, "server"), { recursive: true });

console.log("[5/5] 基于预打包目录生成 NSIS 安装包...");
execFileSync(
  "npx",
  [
    "electron-builder",
    "--win",
    "nsis",
    "--prepackaged",
    "release/win-unpacked",
    "--config.directories.output=release",
    "--config.publish.provider=generic",
    "--config.publish.url=https://example.invalid",
    "--publish",
    "never",
  ],
  { cwd: appDir, stdio: "inherit", shell: true }
);

// electron-builder 生成卸载器时可能留下同名临时目录；它不是源码。
fs.rmSync(path.join(root, "life-workbench-desktop"), { recursive: true, force: true });

console.log("完成！产物在 desktop-app/release/ 目录");

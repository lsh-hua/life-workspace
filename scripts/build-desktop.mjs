// 桌面包构建：Next standalone → 组装 Electron 运行目录 → NSIS 安装器。
// 直接复用已安装的 Electron 运行时，避开 electron-builder dir 在本机被实时防护拖死的问题。
// 每次构建独立输出到版本与时间戳目录，保留已有安装器和构建现场。
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "desktop-app");
const version = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")).version;
if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version)) throw new Error("桌面版本号无效");
const stamp = new Date().toISOString().replace(/[-:.]/g, "");
const buildId = `${version}-${stamp}-${randomUUID().slice(0, 6)}`;
const buildDir = path.join(root, "desktop-build", buildId);
const outDir = path.join(appDir, "release", buildId);
const unpacked = path.join(outDir, "win-unpacked");
const require = createRequire(import.meta.url);
const runNode = (module, args, cwd = root) => execFileSync(process.execPath, [require.resolve(module), ...args], { cwd, stdio: "inherit" });

function assertNoDatabases(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) assertNoDatabases(filePath);
    else if (/\.(db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/i.test(entry.name)) {
      throw new Error(`构建中止：发布目录含数据库文件 ${filePath}`);
    }
  }
}

function assertBackupRoutes(serverDirectory) {
  for (const route of ["api/backups/route.js", "api/backups/[name]/route.js"]) {
    const filePath = path.join(serverDirectory, ".next", "server", "app", route);
    if (!fs.existsSync(filePath)) throw new Error(`构建中止：备份接口运行文件缺失 ${filePath}`);
  }
}

console.log("[1/5] next build (webpack, standalone)...");
runNode("next/dist/bin/next", ["build", "--webpack"]);

console.log("[2/5] 组装 standalone 产物...");
const standalone = path.join(buildDir, "server");
const standaloneSource = path.join(root, ".next", "standalone");
fs.mkdirSync(buildDir, { recursive: true });
fs.cpSync(standaloneSource, standalone, {
  recursive: true,
  filter(source) {
    const segments = path.relative(standaloneSource, source).split(path.sep);
    return segments[0] !== "data";
  },
});
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}
// 只排除顶层用户 data/（含备份）；保留 .next/server/app/api/backups 等代码目录。
// 数据脚本放 server 根目录，复用其中的原生数据库依赖。
for (const file of ["migrate.mjs", "backup.mjs", "data-safety.mjs"]) {
  fs.copyFileSync(path.join(root, "scripts", file), path.join(standalone, file));
}
fs.cpSync(path.join(root, "db", "migrations"), path.join(standalone, "migrations"), { recursive: true });
// standalone 追踪会漏掉 libsql 的原生平台包，手动补齐
const libsqlNative = path.join(standalone, "node_modules", "@libsql", "win32-x64-msvc");
if (!fs.existsSync(libsqlNative)) {
  fs.cpSync(path.join(root, "node_modules", "@libsql", "win32-x64-msvc"), libsqlNative, { recursive: true });
}

assertNoDatabases(standalone);
assertBackupRoutes(standalone);

console.log("[3/5] 组装 Electron 运行目录...");
const electronDist = path.join(root, "node_modules", "electron", "dist");
if (!fs.existsSync(path.join(electronDist, "electron.exe"))) {
  throw new Error("缺少 Electron 运行时，请先执行 npm install");
}
fs.cpSync(electronDist, unpacked, { recursive: true });
fs.renameSync(path.join(unpacked, "electron.exe"), path.join(unpacked, "人生工作台.exe"));

console.log("[4/5] 复制桌面入口与 server...");
const targetApp = path.join(unpacked, "resources", "app");
fs.mkdirSync(targetApp, { recursive: true });
for (const file of ["main.cjs", "preload.cjs", "draft-store.cjs", "package.json"]) {
  fs.copyFileSync(path.join(appDir, file), path.join(targetApp, file));
}
fs.cpSync(standalone, path.join(targetApp, "server"), { recursive: true });
assertNoDatabases(unpacked);
assertBackupRoutes(path.join(targetApp, "server"));

console.log("[5/5] 基于预打包目录生成 NSIS 安装包...");
runNode(
  "electron-builder/cli.js",
  [
    "--win",
    "nsis",
    "--prepackaged",
    unpacked,
    `--config.directories.output=${outDir}`,
    "--config.publish.provider=generic",
    "--config.publish.url=https://example.invalid",
    "--publish",
    "never",
  ],
  appDir,
);

assertNoDatabases(outDir);
console.log(`完成！安装包保存在 ${outDir}`);

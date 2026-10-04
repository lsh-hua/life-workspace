import path from "node:path";
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// 数据目录：桌面打包版用 WORKBENCH_DATA_DIR（指向 %APPDATA%），网页开发版用项目内 data/
const dataDir =
  process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const url = "file:" + path.join(dataDir, "workbench.db");

// 开发模式 HMR 下复用连接
const globalForDb = globalThis as unknown as { __libsql?: ReturnType<typeof createClient> };
const client = globalForDb.__libsql ?? createClient({ url });
globalForDb.__libsql = client;

export const db = drizzle(client, { schema });
export { schema };

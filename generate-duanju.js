#!/usr/bin/env node
/**
 * generate-duanju.js — 生成 duanju.js（Forward 插件模块，指向本 VPS 的 API）
 * 用法: node generate-duanju.js --base http://<ip>:<port> [--out /path/duanju.js]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : "";
}

const base = (argValue("--base") || argValue("-b") || "").trim();
if (!base) {
  console.error("用法: node generate-duanju.js --base http://<ip>:<port> [--out /path/duanju.js]");
  process.exit(1);
}
const normalized = base.replace(/\/+$/, "");
if (!/^https?:\/\/[^/?#\s]+(?:\/\d+)?$/i.test(normalized)) {
  console.error("base 须为 http(s)://域名或IP[:端口]，如 http://1.2.3.4:6666");
  process.exit(1);
}

const template = readFileSync(join(__dirname, "duanju.template.js"), "utf8");
const output = template.replace(/__API_BASE__/g, normalized);
const outPath = argValue("--out") || join(__dirname, "duanju.js");
writeFileSync(outPath, output, "utf8");

console.log("已生成模块: " + outPath);
console.log("apiBase = " + normalized);

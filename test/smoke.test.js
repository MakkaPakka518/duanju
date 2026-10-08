import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = HERE + "/..";

test("服务启动且 /healthz 返回 ok", async () => {
  const PORT = 6677;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), STREAM_SECRET: "smoke-test-secret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.ok(body.providers.includes("hongguo"));
  } finally {
    child.kill();
  }
});

test("/duanju.js 存在且 apiBase 可读", async () => {
  const PORT = 6678;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), STREAM_SECRET: "smoke-test-secret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`http://127.0.0.1:${PORT}/duanju.js`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("WidgetMetadata = {"));
    assert.ok(text.includes("id: \"forward.hongguo.full\""));
  } finally {
    child.kill();
  }
});

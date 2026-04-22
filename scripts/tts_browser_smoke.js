const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl + "/healthz", { cache: "no-store" });
      if (response.ok) return;
    } catch (_) {}
    await delay(500);
  }
  throw new Error("Server did not become ready in time");
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function withServer(envOverrides, run) {
  const repoRoot = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), ...envOverrides },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, 60000);
    return await run({
      baseUrl,
      getLogs: () => ({ stdout, stderr })
    });
  } finally {
    server.kill("SIGTERM");
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    throw new Error(
      "playwright is not installed. Run: npx -y -p playwright@1.52.0 node scripts/tts_browser_smoke.js"
    );
  }

  const results = {};

  results.success = await withServer({}, async ({ baseUrl }) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error && error.message ? error.message : error)));

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.selectOption("#langSelect", "en-US");
    await page.fill("#inputText", "Hello from local Piper in the browser.");
    const first = await page.evaluate(async () => {
      const runtime = await window.v3PortableTtsEnsureRuntime();
      const firstResult = await runtime.provider.synthesize({
        text: "Hello from local Piper in the browser.",
        lang: "en",
        voiceId: "en-default",
        speed: 1,
        pitch: 0,
        cache: true
      });
      window.v3PortableTtsApplyResult(firstResult, { isMainText: true });
      return {
        firstBackend: firstResult.backend,
        firstActualBackend: firstResult.diagnostics.actualBackend,
        firstCacheHit: firstResult.diagnostics.cacheHit,
        firstModelStatus: firstResult.diagnostics.modelStatus,
        firstRuntimeStatus: firstResult.diagnostics.runtimeStatus
      };
    });
    await page.click("body");
    const playback = await page.evaluate(async () => {
      const runtime = await window.v3PortableTtsEnsureRuntime();
      const result = await runtime.provider.synthesize({
        text: "Hello from local Piper in the browser.",
        lang: "en",
        voiceId: "en-default",
        speed: 1,
        pitch: 0,
        cache: true
      });
      const timer = setTimeout(function () {
        runtime.provider.stop().catch(() => {});
      }, 200);
      const outcome = await runtime.provider.play(result);
      clearTimeout(timer);
      window.v3PortableTtsApplyResult(result, { isMainText: true });
      window.v3PortableTtsRenderDiagnostics(result);
      return {
        backend: result.backend,
        actualBackend: result.diagnostics.actualBackend,
        cacheHit: result.diagnostics.cacheHit,
        renderMs: result.diagnostics.renderMs,
        stopped: !!(outcome && outcome.stopped)
      };
    });

    await browser.close();

    assert(pageErrors.length === 0, "Page errors during web_wasm smoke: " + pageErrors.join(" | "));
    assert(first.firstBackend === "web_wasm", "Expected web_wasm backend");
    assert(first.firstActualBackend === "web_wasm", "Expected actual web_wasm backend");
    assert(first.firstCacheHit === false, "Expected cache miss on first synthesis");
    assert(first.firstRuntimeStatus === "runtime_ready", "Expected runtime_ready");
    assert(first.firstModelStatus === "model_ready", "Expected model_ready");
    assert(playback.backend === "web_wasm", "Expected playback web_wasm backend");
    assert(playback.cacheHit === true, "Expected cache hit on repeated synthesis");
    return { first, playback };
  });

  results.fallback = await withServer(
    {
      TTS_WEB_WASM_ENABLED: "false",
      TTS_ALLOW_SYSTEM_FALLBACK: "true"
    },
    async ({ baseUrl }) => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      await context.addInitScript(() => {
        class MockUtterance {
          constructor(text) {
            this.text = text;
            this.lang = "";
            this.rate = 1;
            this.pitch = 1;
            this.voice = null;
            this.onend = null;
            this.onerror = null;
          }
        }
        window.SpeechSynthesisUtterance = MockUtterance;
        window.speechSynthesis = {
          cancel() {},
          getVoices() {
            return [{ lang: "en-US", name: "Mock English" }];
          },
          speak(utterance) {
            setTimeout(() => {
              if (utterance && typeof utterance.onend === "function") {
                utterance.onend();
              }
            }, 10);
          }
        };
      });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

      const result = await page.evaluate(async () => {
        const runtime = await window.v3PortableTtsEnsureRuntime();
        const output = await runtime.provider.synthesize({
          text: "Fallback path",
          lang: "en",
          voiceId: "en-default",
          speed: 1,
          pitch: 0,
          cache: true
        });
        window.v3PortableTtsApplyResult(output, { isMainText: true });
        return {
          backend: output.backend,
          actualBackend: output.diagnostics.actualBackend,
          fallbackReason: output.diagnostics.fallbackReason,
          badge: document.getElementById("localTtsProviderBadge").textContent
        };
      });

      await browser.close();
      assert(result.backend === "system_fallback", "Expected system fallback backend");
      assert(result.fallbackReason === "web_wasm_disabled", "Expected web_wasm_disabled fallback reason");
      return result;
    }
  );

  results.unavailable = await withServer(
    {
      TTS_WEB_WASM_ENABLED: "false",
      TTS_ALLOW_SYSTEM_FALLBACK: "false"
    },
    async ({ baseUrl }) => {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 }
      });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

      const result = await page.evaluate(async () => {
        try {
          const runtime = await window.v3PortableTtsEnsureRuntime();
          await runtime.provider.synthesize({
            text: "Unavailable path",
            lang: "en",
            voiceId: "en-default",
            speed: 1,
            pitch: 0,
            cache: true
          });
          return { ok: false };
        } catch (error) {
          const btnRect = document.getElementById("btnMainTts").getBoundingClientRect();
          return {
            ok: true,
            code: error.code,
            buttonWithinViewport: btnRect.right <= window.innerWidth + 1
          };
        }
      });

      await browser.close();
      assert(result.ok, "Expected unavailable path to reject");
      assert(result.code === "web_wasm_disabled", "Expected web_wasm_disabled error");
      assert(result.buttonWithinViewport, "Main TTS button overflowed mobile viewport");
      return result;
    }
  );

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exitCode = 1;
});

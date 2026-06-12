import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import { SignJWT } from "jose";

dotenv.config({ path: ".env.local" });

const root = process.cwd();
const store = JSON.parse(await fs.readFile(path.join(root, "data", "app-db.json"), "utf8"));
const user = store.users.find(
  (candidate) =>
    candidate.role === "MANAGER" &&
    candidate.termsAcceptedAt &&
    candidate.privacyAcceptedAt &&
    candidate.ageVerifiedAt &&
    (candidate.stripeConnectedAccountId || candidate.stripeAccountId)
);
if (!user) throw new Error("No local manager fixture is ready for Stripe settings visual QA.");

const token = await new SignJWT({
  sub: user.id,
  organizationId: user.organizationId,
  role: user.role,
  email: user.email,
  sessionVersion: user.sessionVersion ?? 0
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9224;
const profilePath = path.join(root, ".codex-logs", "edge-stripe-ui-profile");
const edge = spawn(
  edgePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profilePath}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ],
  { stdio: "ignore", windowsHide: true }
);

async function retry(operation, attempts = 50) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

const version = await retry(async () => {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error("Edge debugging endpoint is not ready.");
  return response.json();
});

const pageResponse = await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent("http://127.0.0.1:3011/settings#payments-stripe")}`,
  { method: "PUT" }
);
const page = await pageResponse.json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 1800));
}

async function screenshot(fileName) {
  const result = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true
  });
  await fs.writeFile(path.join(root, ".codex-logs", fileName), Buffer.from(result.data, "base64"));
}

try {
  await command("Page.enable");
  await command("Network.enable");
  await command("Runtime.enable");
  await command("Network.setCookie", {
    name: "rentroll_session",
    value: token,
    url: "http://127.0.0.1:3011",
    httpOnly: true,
    sameSite: "Lax",
    path: "/"
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command("Page.navigate", { url: "http://127.0.0.1:3011/settings#payments-stripe" });
  await settle();
  await command("Runtime.evaluate", {
    expression: "document.querySelector('#payments-stripe')?.scrollIntoView({block:'start'})"
  });
  await settle();
  await screenshot("stripe-settings-desktop.png");

  await command("Runtime.evaluate", {
    expression: `(() => {
      const target = document.querySelector('.stripe-recovery');
      if (!target) return false;
      const overlay = document.createElement('div');
      overlay.id = 'stripe-recovery-qa-overlay';
      overlay.className = 'stripe-settings';
      overlay.style.cssText = 'position:fixed;inset:58px 0 0 258px;z-index:9999;background:#f5f6f7;padding:28px;overflow:auto;';
      overlay.append(target.cloneNode(true));
      document.body.append(overlay);
      return true;
    })()`
  });
  await settle();
  await screenshot("stripe-settings-repair.png");
  await command("Runtime.evaluate", {
    expression: "document.querySelector('#stripe-recovery-qa-overlay')?.remove()"
  });

  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  await command("Page.navigate", { url: "http://127.0.0.1:3011/settings#payments-stripe" });
  await settle();
  await command("Runtime.evaluate", {
    expression: "document.querySelector('#payments-stripe')?.scrollIntoView({block:'start'})"
  });
  await settle();
  await screenshot("stripe-settings-mobile.png");
  await command("Runtime.evaluate", {
    expression: "document.querySelector('.stripe-recovery')?.scrollIntoView({block:'start'})"
  });
  await settle();
  await screenshot("stripe-settings-mobile-recovery.png");

  const state = await command("Runtime.evaluate", {
    expression: `JSON.stringify({
      url: location.href,
      title: document.title,
      hasPaymentsHeading: Boolean([...document.querySelectorAll('h2')].find((node) => node.textContent?.trim() === 'Payments')),
      hasRecoveryWorkflow: Boolean(document.querySelector('.stripe-recovery-workflow')),
      recoverySteps: document.querySelectorAll('.stripe-recovery-step').length,
      statusLabels: [...document.querySelectorAll('.stripe-overview-tile-heading span')]
        .filter((node) => ['Payments', 'Payouts'].includes(node.textContent?.trim()))
        .map((node) => ({
          label: node.textContent.trim(),
          width: Math.round(node.getBoundingClientRect().width),
          height: Math.round(node.getBoundingClientRect().height),
          writingMode: getComputedStyle(node).writingMode
        })),
      buttonContentAligned: [...document.querySelectorAll('.stripe-settings .ui-button > span')]
        .every((node) => getComputedStyle(node).display.includes('flex') && getComputedStyle(node).alignItems === 'center'),
      scrollTop: document.querySelector('.app-content')?.scrollTop,
      scrollHeight: document.querySelector('.app-content')?.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      viewportWidth: document.documentElement.clientWidth
    })`,
    returnByValue: true
  });
  console.log(state.result.value);
} finally {
  socket.close();
  edge.kill();
}

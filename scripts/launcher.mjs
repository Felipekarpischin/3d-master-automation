import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const appData = process.env.APPDATA || "";
const localAppData = process.env.LOCALAPPDATA || "";
const n8nEntry = path.join(appData, "npm", "node_modules", "n8n", "bin", "n8n");
const ollamaApp = path.join(localAppData, "Programs", "Ollama", "ollama app.exe");
await mkdir(path.join(ROOT, "data", "n8n"), { recursive: true });

console.log("\n3D Master — iniciando serviços locais...\n");

if (!(await online("http://127.0.0.1:11434/api/version"))) {
  const ollama = spawn(ollamaApp, [], { detached: true, stdio: "ignore", windowsHide: true });
  ollama.unref();
  await waitFor("http://127.0.0.1:11434/api/version", "Ollama");
} else {
  console.log("✓ Ollama já está ativo");
}

if (!(await online("http://127.0.0.1:3333/api/bootstrap"))) {
  const app = spawn(process.execPath, [path.join(ROOT, "server.mjs")], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], windowsHide: true });
  children.push(app);
  await waitFor("http://127.0.0.1:3333/api/bootstrap", "Painel");
} else {
  console.log("✓ Painel já está ativo");
}

if (!(await online("http://127.0.0.1:5678/healthz"))) {
  const n8n = spawn(process.execPath, [n8nEntry, "start"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    windowsHide: true,
    env: {
      ...process.env,
      N8N_USER_FOLDER: path.join(ROOT, "data", "n8n"),
      N8N_DIAGNOSTICS_ENABLED: "false",
      N8N_PERSONALIZATION_ENABLED: "false",
      N8N_VERSION_NOTIFICATIONS_ENABLED: "false",
      N8N_LISTEN_ADDRESS: "127.0.0.1",
      N8N_HOST: "127.0.0.1",
      N8N_PORT: "5678",
      N8N_PROTOCOL: "http",
      N8N_SECURE_COOKIE: "false",
      N8N_WEBHOOK_URL: "http://127.0.0.1:5678/",
      GENERIC_TIMEZONE: "America/Sao_Paulo",
      TZ: "America/Sao_Paulo",
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: "false",
      N8N_UNVERIFIED_PACKAGES_ENABLED: "false",
      N8N_RUNNERS_ENABLED: "false",
      N8N_RUNNERS_TASK_TIMEOUT: "300",
    },
  });
  children.push(n8n);
  await waitFor("http://127.0.0.1:5678/healthz", "n8n");
} else {
  console.log("✓ n8n já está ativo");
}

console.log("\nSistema pronto:");
console.log("  Painel: http://127.0.0.1:3333");
console.log("  Automação: http://127.0.0.1:5678");
console.log("\nMantenha esta janela aberta. Pressione Ctrl+C para encerrar.\n");

spawn("cmd.exe", ["/c", "start", "", "http://127.0.0.1:3333"], { detached: true, stdio: "ignore", windowsHide: true }).unref();

const shutdown = () => {
  console.log("\nEncerrando os serviços iniciados por esta janela...");
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await new Promise(() => {});

async function online(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
}

async function waitFor(url, name) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await online(url)) { console.log(`✓ ${name} iniciado`); return; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} não iniciou dentro do tempo esperado.`);
}

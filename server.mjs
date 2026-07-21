import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { calculateQuote, fallbackMessage } from "./lib/pricing.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");
await mkdir(UPLOADS, { recursive: true });
const db = new DatabaseSync(path.join(DATA, "3d-master.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(name, contact)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, customer_id INTEGER NOT NULL,
    product TEXT NOT NULL, size TEXT, quantity INTEGER NOT NULL, color TEXT, weight REAL,
    print_hours REAL, deadline TEXT, notes TEXT, image_path TEXT, status TEXT NOT NULL DEFAULT 'novo',
    material_cost REAL, machine_cost REAL, energy_cost REAL, extra_cost REAL, margin REAL,
    total_price REAL, message TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
`);

const defaults = {
  company_name: "3D Master", filament_price_kg: "100", machine_hour_cost: "3.50",
  energy_hour_cost: "0.80", default_margin: "40", minimum_order: "20",
  ollama_url: "http://127.0.0.1:11434", ollama_model: "qwen3.5:4b", n8n_webhook_url: "",
};
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries(defaults)) insertSetting.run(key, value);

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await staticFile(res, url.pathname);
  } catch (error) {
    console.error(error);
    json(res, error.status || 500, { error: error.status ? error.message : "Não foi possível concluir esta operação." });
  }
});

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const orders = db.prepare(`SELECT o.*, c.name customer_name, c.contact customer_contact FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.id DESC`).all();
    const customers = db.prepare(`SELECT c.*, COUNT(o.id) order_count, COALESCE(SUM(o.total_price),0) total_spent FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.id DESC`).all();
    return json(res, 200, { orders, customers, settings: getSettings() });
  }

  if (req.method === "POST" && url.pathname === "/api/quote") {
    const body = await bodyJson(req);
    return json(res, 200, calculateQuote(body, getSettings()));
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    const body = await bodyJson(req);
    validateOrder(body);
    const settings = getSettings();
    const quote = calculateQuote(body, settings);
    const customer = upsertCustomer(body.customerName.trim(), body.contact.trim());
    const imagePath = await saveImage(body.referenceImage);
    const result = db.prepare(`INSERT INTO orders (customer_id, product, size, quantity, color, weight, print_hours, deadline, notes, image_path, material_cost, machine_cost, energy_cost, extra_cost, margin, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      customer.id, body.product.trim(), body.size || "", Number(body.quantity), body.color || "", Number(body.weight) || 0,
      Number(body.printHours) || 0, body.deadline || "", body.notes || "", imagePath, quote.materialCost, quote.machineCost,
      quote.energyCost, quote.extraCost, quote.margin, quote.total
    );
    const id = Number(result.lastInsertRowid);
    const code = `3DM-${String(id).padStart(4, "0")}`;
    const order = getOrder(id);
    const message = fallbackMessage({ ...order, total_price: quote.total }, settings.company_name);
    db.prepare("UPDATE orders SET code=?, message=? WHERE id=?").run(code, message, id);
    const saved = getOrder(id);
    notifyN8n(settings.n8n_webhook_url, saved);
    return json(res, 201, saved);
  }

  const statusMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const body = await bodyJson(req);
    const valid = ["novo", "orcamento_enviado", "aprovado", "imprimindo", "entregue", "cancelado"];
    if (!valid.includes(body.status)) return json(res, 400, { error: "Status inválido." });
    db.prepare("UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(body.status, Number(statusMatch[1]));
    return json(res, 200, getOrder(Number(statusMatch[1])));
  }

  const messageMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/message$/);
  if (req.method === "POST" && messageMatch) {
    const order = getOrder(Number(messageMatch[1]));
    if (!order) return json(res, 404, { error: "Pedido não encontrado." });
    const settings = getSettings();
    let message = fallbackMessage(order, settings.company_name);
    let usedAi = false;
    try {
      const response = await fetch(`${settings.ollama_url}/api/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          model: settings.ollama_model,
          stream: false,
          think: false,
          keep_alive: "10m",
          options: { num_ctx: 4096, temperature: 0.2 },
          prompt: aiPrompt(order, message),
        }),
      });
      if (response.ok) {
        const generated = await response.json();
        if (generated.response?.trim()) { message = generated.response.trim(); usedAi = true; }
      }
    } catch { /* fallback local permanece disponível */ }
    db.prepare("UPDATE orders SET message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, order.id);
    return json(res, 200, { message, usedAi });
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await bodyJson(req);
    const allowed = Object.keys(defaults);
    const update = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    for (const key of allowed) if (body[key] !== undefined) update.run(key, String(body[key]));
    return json(res, 200, getSettings());
  }

  json(res, 404, { error: "Rota não encontrada." });
}

function getSettings() {
  return Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map(({ key, value }) => [key, value]));
}
function getOrder(id) {
  return db.prepare(`SELECT o.*, c.name customer_name, c.contact customer_contact FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?`).get(id);
}
function upsertCustomer(name, contact) {
  db.prepare("INSERT OR IGNORE INTO customers(name,contact) VALUES(?,?)").run(name, contact);
  return db.prepare("SELECT * FROM customers WHERE name=? AND contact=?").get(name, contact);
}
function validateOrder(body) {
  if (!body.customerName?.trim() || !body.contact?.trim() || !body.product?.trim()) throw Object.assign(new Error("Preencha cliente, contato e produto."), { status: 400 });
  if (!Number(body.quantity) || Number(body.quantity) < 1) throw Object.assign(new Error("A quantidade deve ser maior que zero."), { status: 400 });
}
async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 6_000_000) throw Object.assign(new Error("Arquivo muito grande."), { status: 413 }); }
  try { return JSON.parse(raw || "{}"); } catch { throw Object.assign(new Error("Dados inválidos."), { status: 400 }); }
}
async function saveImage(dataUrl) {
  if (!dataUrl) return "";
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) return "";
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOADS, name), Buffer.from(match[2], "base64"));
  return `/uploads/${name}`;
}
async function staticFile(res, pathname) {
  const relative = pathname.replace(/^\/+/, "");
  let file = pathname === "/" ? path.join(ROOT, "public", "index.html") : pathname.startsWith("/uploads/") ? path.join(DATA, relative) : path.join(ROOT, "public", relative);
  file = path.normalize(file);
  if (!file.startsWith(ROOT) || !existsSync(file)) file = path.join(ROOT, "public", "index.html");
  const content = await readFile(file);
  res.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(content);
}
function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
function aiPrompt(order, fallback) {
  return `Reescreva a mensagem abaixo em português do Brasil, de forma breve, profissional e calorosa. Não invente informações, não altere preço ou prazo e não use markdown. Mensagem:\n${fallback}\nObservações do pedido: ${order.notes || "nenhuma"}`;
}
async function notifyN8n(webhook, order) {
  if (!webhook) return;
  try { await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order), signal: AbortSignal.timeout(5000) }); } catch { /* integração opcional */ }
}

const PORT = Number(process.env.PORT) || 3333;
server.listen(PORT, "127.0.0.1", () => console.log(`3D Master disponível em http://127.0.0.1:${PORT}`));

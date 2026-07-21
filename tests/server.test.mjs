import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

test("servidor executa CRUD de pedidos no SQLite", async t => {
  const port = 3347;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: path.resolve("."),
    env: { ...process.env, PORT: String(port), DATA_DIR: path.resolve("work/test-data") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Servidor não iniciou.")), 5000);
    child.stdout.on("data", chunk => { if (chunk.toString().includes("disponível")) { clearTimeout(timer); resolve(); } });
    child.on("error", reject);
  });

  const quoteResponse = await fetch(`http://127.0.0.1:${port}/api/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: 1, weight: 100, printHours: 2, margin: 40 }) });
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  assert.ok(quote.total >= 20);

  const unique = Date.now();
  const createResponse = await fetch(`http://127.0.0.1:${port}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: `Cliente ${unique}`, contact: "11999999999", product: "Peça de teste", quantity: 1, weight: 100, printHours: 2, margin: 40 }) });
  assert.equal(createResponse.status, 201);
  const order = await createResponse.json();
  assert.match(order.code, /^3DM-\d{4}$/);
  assert.match(order.message, /Peça de teste/);

  const bootstrap = await fetch(`http://127.0.0.1:${port}/api/bootstrap`).then(response => response.json());
  assert.ok(bootstrap.orders.some(item => item.id === order.id));
  assert.ok(bootstrap.customers.some(item => item.name === `Cliente ${unique}`));

  const updateResponse = await fetch(`http://127.0.0.1:${port}/api/orders/${order.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerName: `Cliente atualizado ${unique}`, contact: "11888888888", product: "Peça revisada", quantity: 2, weight: 120, printHours: 3, margin: 35, color: "Azul" }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.product, "Peça revisada");
  assert.equal(updated.customer_name, `Cliente atualizado ${unique}`);
  assert.equal(updated.quantity, 2);
  assert.equal(updated.color, "Azul");
  assert.match(updated.message, /Peça revisada/);

  const updatedBootstrap = await fetch(`http://127.0.0.1:${port}/api/bootstrap`).then(response => response.json());
  assert.ok(updatedBootstrap.orders.some(item => item.id === order.id && item.product === "Peça revisada"));
  assert.ok(!updatedBootstrap.customers.some(item => item.name === `Cliente ${unique}`));

  const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/orders/${order.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deleted: true, id: order.id });

  const deletedBootstrap = await fetch(`http://127.0.0.1:${port}/api/bootstrap`).then(response => response.json());
  assert.ok(!deletedBootstrap.orders.some(item => item.id === order.id));
  assert.ok(!deletedBootstrap.customers.some(item => item.name === `Cliente atualizado ${unique}`));
});

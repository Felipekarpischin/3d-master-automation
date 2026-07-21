import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuote, fallbackMessage } from "../lib/pricing.mjs";

test("calcula material, máquina, energia e margem", () => {
  const quote = calculateQuote(
    { quantity: 2, weight: 100, printHours: 3, extraCost: 5, margin: 40 },
    { filament_price_kg: 100, machine_hour_cost: 3.5, energy_hour_cost: 0.8, minimum_order: 20 },
  );
  assert.equal(quote.materialCost, 20);
  assert.equal(quote.machineCost, 21);
  assert.equal(quote.energyCost, 4.8);
  assert.equal(quote.subtotal, 50.8);
  assert.equal(quote.total, 84.67);
});

test("respeita o valor mínimo do pedido", () => {
  const quote = calculateQuote(
    { quantity: 1, weight: 5, printHours: 0.1, margin: 20 },
    { filament_price_kg: 80, machine_hour_cost: 2, energy_hour_cost: 0.5, minimum_order: 25 },
  );
  assert.equal(quote.total, 25);
});

test("gera mensagem utilizável sem inteligência artificial", () => {
  const message = fallbackMessage({ customer_name: "Ana Souza", quantity: 2, product: "Vaso geométrico", color: "Branco", deadline: "2026-07-30", total_price: 89.9 });
  assert.match(message, /Olá, Ana!/);
  assert.match(message, /R\$\s89,90/);
  assert.match(message, /30\/07\/2026/);
});

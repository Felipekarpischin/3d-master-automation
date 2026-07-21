export function calculateQuote(input, settings) {
  const quantity = positive(input.quantity, 1);
  const weight = positive(input.weight, 0);
  const hours = positive(input.printHours, 0);
  const extra = positive(input.extraCost, 0);
  const materialGrams = weight * quantity;
  const materialCost = (materialGrams / 1000) * positive(settings.filament_price_kg, 100);
  const machineCost = hours * quantity * positive(settings.machine_hour_cost, 3.5);
  const energyCost = hours * quantity * positive(settings.energy_hour_cost, 0.8);
  const subtotal = materialCost + machineCost + energyCost + extra;
  const margin = Math.min(Math.max(positive(input.margin, settings.default_margin ?? 40), 0), 90);
  const calculated = subtotal / (1 - margin / 100);
  const total = Math.max(calculated, positive(settings.minimum_order, 20));

  return roundValues({
    materialGrams,
    materialCost,
    machineCost,
    energyCost,
    extraCost: extra,
    subtotal,
    margin,
    total,
  });
}

export function fallbackMessage(order, companyName = "3D Master") {
  const firstName = String(order.customer_name || "cliente").trim().split(/\s+/)[0];
  const deadline = order.deadline ? formatDate(order.deadline) : "a combinar";
  const total = brl(order.total_price || 0);
  return `Olá, ${firstName}! Tudo bem?\n\nPreparei o orçamento para ${order.quantity}x ${order.product}.\n\n• Cor: ${order.color || "a definir"}\n• Prazo estimado: ${deadline}\n• Valor total: ${total}\n\nO orçamento considera a produção conforme as informações enviadas. Posso dar andamento?\n\n${companyName}`;
}

export function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function roundValues(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "number" ? Math.round(value * 100) / 100 : value]));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

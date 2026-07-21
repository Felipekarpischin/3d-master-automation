const state = { orders: [], customers: [], settings: {}, currentOrder: null };
const statusLabels = { novo: "Novo", orcamento_enviado: "Orçamento enviado", aprovado: "Aprovado", imprimindo: "Imprimindo", entregue: "Entregue", cancelado: "Cancelado" };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const brl = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
const date = value => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : "A combinar";
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

async function load() {
  try { Object.assign(state, await api("/api/bootstrap")); renderAll(); fillSettings(); }
  catch (error) { toast(error.message, true); }
}

function renderAll() {
  const active = state.orders.filter(order => !["entregue", "cancelado"].includes(order.status));
  $("#order-count").textContent = active.length;
  $("#metric-active").textContent = active.length;
  $("#metric-printing").textContent = state.orders.filter(order => order.status === "imprimindo").length;
  $("#metric-approved").textContent = brl(state.orders.filter(order => ["aprovado", "imprimindo"].includes(order.status)).reduce((sum, order) => sum + Number(order.total_price), 0));
  renderOrders(); renderCustomers();
}

function renderOrders() {
  const term = $("#order-search").value.toLowerCase();
  const status = $("#status-filter").value;
  const orders = state.orders.filter(order => (!status || order.status === status) && [order.code, order.customer_name, order.product].join(" ").toLowerCase().includes(term));
  $("#orders-empty").style.display = orders.length ? "none" : "block";
  $("#orders-list").innerHTML = orders.map(order => `<tr>
    <td><span class="order-code">${order.code}</span><small>${date(order.created_at)}</small></td>
    <td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_contact)}</small></td>
    <td><strong>${escapeHtml(order.product)}</strong><small>${order.quantity} unidade(s)</small></td>
    <td><span class="status ${order.status}">${statusLabels[order.status]}</span></td>
    <td><strong>${brl(order.total_price)}</strong></td>
    <td><button class="link-button" data-detail="${order.id}">Abrir</button></td>
  </tr>`).join("");
}

function renderCustomers() {
  $("#customers-empty").style.display = state.customers.length ? "none" : "block";
  $("#customers-list").innerHTML = state.customers.map(customer => `<tr><td><strong>${escapeHtml(customer.name)}</strong></td><td>${escapeHtml(customer.contact)}</td><td>${customer.order_count}</td><td><strong>${brl(customer.total_spent)}</strong></td></tr>`).join("");
}

function switchView(view) {
  $$(".view").forEach(element => element.classList.toggle("active", element.id === `${view}-view`));
  $$(".nav-item").forEach(element => element.classList.toggle("active", element.dataset.view === view));
  window.scrollTo(0, 0);
}

function setOverlay(id, open) {
  const overlay = $(id); overlay.classList.toggle("open", open); overlay.setAttribute("aria-hidden", String(!open));
  document.body.style.overflow = open ? "hidden" : "";
}
function openOrder() {
  $("#order-form").elements.margin.value = state.settings.default_margin || 40;
  setOverlay("#order-overlay", true); calculatePreview();
  setTimeout(() => $("#order-form").elements.customerName.focus(), 100);
}
function closeOrder() { setOverlay("#order-overlay", false); }

async function calculatePreview() {
  const body = Object.fromEntries(new FormData($("#order-form")));
  try {
    const quote = await api("/api/quote", { method: "POST", body: JSON.stringify(body) });
    $("#preview-total").textContent = brl(quote.total);
    $("#preview-breakdown").textContent = `Custo ${brl(quote.subtotal)} · Margem ${quote.margin}%`;
  } catch {}
}

async function submitOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const file = form.elements.image.files[0];
  if (file?.size > 3_000_000) return toast("A imagem deve ter no máximo 3 MB.", true);
  if (file) data.referenceImage = await fileToData(file);
  const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = "Salvando...";
  try {
    await api("/api/orders", { method: "POST", body: JSON.stringify(data) });
    form.reset(); closeOrder(); await load(); toast("Pedido salvo.");
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = "Salvar pedido"; }
}

function openDetail(id) {
  const order = state.orders.find(item => Number(item.id) === Number(id)); if (!order) return;
  state.currentOrder = order; $("#detail-code").textContent = order.code; $("#detail-title").textContent = order.product;
  $("#detail-content").innerHTML = `<div class="detail-top"><div><h3>${escapeHtml(order.customer_name)}</h3><p>${escapeHtml(order.customer_contact)}</p></div><span class="status ${order.status}">${statusLabels[order.status]}</span></div>
    <div class="detail-grid"><div><small>Quantidade</small><strong>${order.quantity}</strong></div><div><small>Prazo</small><strong>${date(order.deadline)}</strong></div><div><small>Cor</small><strong>${escapeHtml(order.color || "—")}</strong></div><div><small>Peso</small><strong>${order.weight || 0} g</strong></div><div><small>Tempo</small><strong>${order.print_hours || 0} h</strong></div><div><small>Margem</small><strong>${order.margin}%</strong></div></div>
    <div class="cost-box"><div class="cost-row"><span>Material</span><strong>${brl(order.material_cost)}</strong></div><div class="cost-row"><span>Máquina e energia</span><strong>${brl(Number(order.machine_cost) + Number(order.energy_cost))}</strong></div><div class="cost-row"><span>Extras</span><strong>${brl(order.extra_cost)}</strong></div><div class="cost-row total"><span>Valor sugerido</span><strong>${brl(order.total_price)}</strong></div></div>
    <label class="status-field"><span>Status</span><select id="detail-status">${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}" ${key === order.status ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <div class="message-box" id="message-box">${escapeHtml(order.message || "")}</div>
    <div class="detail-actions"><button class="copy-button" id="copy-message">Copiar para WhatsApp</button><button class="ai-button" id="ai-message">Melhorar com Ollama</button></div>`;
  setOverlay("#detail-overlay", true);
}
function closeDetail() { setOverlay("#detail-overlay", false); }

async function updateStatus(status) {
  try { await api(`/api/orders/${state.currentOrder.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); openDetail(state.currentOrder.id); toast("Status atualizado."); }
  catch (error) { toast(error.message, true); }
}
async function improveMessage() {
  const button = $("#ai-message"); button.disabled = true; button.textContent = "Gerando...";
  try {
    const result = await api(`/api/orders/${state.currentOrder.id}/message`, { method: "POST" });
    $("#message-box").textContent = result.message;
    toast(result.usedAi ? "Mensagem aprimorada." : "Ollama indisponível. Mantive a mensagem padrão."); await load();
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = "Melhorar com Ollama"; }
}

function fillSettings() { const form = $("#settings-form"); Object.entries(state.settings).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; }); }
async function saveSettings(event) { event.preventDefault(); try { state.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); toast("Ajustes salvos."); } catch (error) { toast(error.message, true); } }
function toast(message, error = false) { const element = $("#toast"); element.textContent = message; element.style.background = error ? "#963f34" : "#202124"; element.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove("show"), 2800); }
function fileToData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

$$('[data-open-order]').forEach(element => element.addEventListener("click", openOrder));
$$(".nav-item").forEach(element => element.addEventListener("click", () => switchView(element.dataset.view)));
document.addEventListener("click", event => { const button = event.target.closest("[data-detail]"); if (button) openDetail(button.dataset.detail); });
$("#close-order").addEventListener("click", closeOrder); $("#cancel-order").addEventListener("click", closeOrder);
$("#close-detail").addEventListener("click", closeDetail);
$("#order-overlay").addEventListener("click", event => { if (event.target.id === "order-overlay") closeOrder(); });
$("#detail-overlay").addEventListener("click", event => { if (event.target.id === "detail-overlay") closeDetail(); });
$("#order-form").addEventListener("submit", submitOrder);
$("#order-form").addEventListener("input", () => { clearTimeout(calculatePreview.timer); calculatePreview.timer = setTimeout(calculatePreview, 180); });
$("#order-search").addEventListener("input", renderOrders); $("#status-filter").addEventListener("change", renderOrders);
$("#settings-form").addEventListener("submit", saveSettings);
$("#detail-content").addEventListener("change", event => { if (event.target.id === "detail-status") updateStatus(event.target.value); });
$("#detail-content").addEventListener("click", async event => { if (event.target.id === "copy-message") { await navigator.clipboard.writeText($("#message-box").textContent); toast("Mensagem copiada."); } if (event.target.id === "ai-message") improveMessage(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeOrder(); closeDetail(); } });
load();

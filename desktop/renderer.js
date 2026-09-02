const money = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", minimumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);
const number = (id) => Math.max(0, Number($(id).value) || 0);
const offerNumber = () => $("offer-number").value.trim() || "Ohne_Angebotsnummer";
let current = null;
let confirmation = null;
const defaultValues = { "offer-number": "ANG-2026-001", name: "Individuelles 3D-Druckteil", "customer-name": "", "customer-address": "", "customer-city": "", quantity: "1", "filament-price": "24.9", grams: "400", "print-hours": "18", "work-hours": "0.9", consumables: "0.5", packaging: "2", shipping: "0", discount: "0", "hourly-rate": "45", profit: "25", fee: "2.5", vat: "0", rounding: "0.5", waste: "5", failure: "8", electricity: "0.2518", power: "0.2", "machine-rate": "0.375", overhead: "5" };

const systemAppearance = window.matchMedia("(prefers-color-scheme: dark)");
let appearanceMode = "system";

function addAppearanceSettings() {
  const section = document.createElement("section");
  section.className = "card appearance-card";
  section.innerHTML = '<div class="heading"><div><p class="kicker">04</p><h2>Erscheinungsbild</h2></div></div><p class="hint">Wähle, ob Druckpreis dem macOS-Design folgen oder immer hell bzw. dunkel erscheinen soll.</p><div class="grid two"><label>Darstellung<select id="appearance"><option value="system">Systemeinstellung</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></label></div>';
  document.querySelector(".settings-save").insertAdjacentElement("beforebegin", section);
}

function applyAppearance(value) {
  appearanceMode = ["system", "light", "dark"].includes(value) ? value : "system";
  const isDark = appearanceMode === "dark" || (appearanceMode === "system" && systemAppearance.matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  if ($("appearance")) $("appearance").value = appearanceMode;
}

addAppearanceSettings();
systemAppearance.addEventListener("change", () => { if (appearanceMode === "system") applyAppearance("system"); });

function calculate() {
  const quantity = Math.max(1, number("quantity"));
  const grams = number("grams"), filamentPrice = number("filament-price"), printHours = number("print-hours");
  const labour = number("work-hours") * number("hourly-rate");
  const material = quantity * grams / 1000 * filamentPrice * (1 + number("waste") / 100);
  const electricity = quantity * printHours * number("power") * number("electricity");
  const machine = quantity * printHours * number("machine-rate");
  const extras = quantity * number("consumables") + number("packaging") + number("shipping");
  const riskBase = material + electricity + machine + quantity * number("consumables");
  const failureRate = Math.min(number("failure") / 100, 0.99);
  const failure = riskBase / (1 - failureRate) - riskBase;
  const overhead = number("overhead");
  const total = labour + material + electricity + machine + extras + failure + overhead;
  const fee = number("fee") / 100, vat = number("vat") / 100;
  const target = total / quantity * (1 + number("profit") / 100) / (1 / (1 + vat) - fee);
  const rounding = number("rounding");
  const price = rounding > 0 ? Math.ceil(target / rounding) * rounding : target;
  const order = price * quantity * (1 - Math.min(number("discount") / 100, 1));
  const net = order / (1 + vat), profit = net - order * fee - total;
  const subtotal = price * quantity, discountPercent = Math.min(number("discount"), 100), discountValue = subtotal * discountPercent / 100;
  current = { offerNumber: offerNumber(), name: $("name").value.trim() || "3D-Druckteil", customer: { name: $("customer-name").value.trim(), address: $("customer-address").value.trim(), city: $("customer-city").value.trim() }, offerDate: $("offer-date").value, validUntil: $("valid-until").value, quantity, price, subtotal, discountPercent, discountValue, order, vatRate: vat, breakdown: [{ label: "Arbeitszeit", value: labour }, { label: "Material", value: material }, { label: "Druckbetrieb & Reserve", value: electricity + machine + failure }, { label: "Weitere Kosten", value: extras + overhead }] };
  $("price").textContent = money.format(price); $("side-price").textContent = money.format(price); $("net-price").textContent = money.format(price / (1 + vat)); $("vat-price").textContent = money.format(price - price / (1 + vat));
  $("labour").textContent = money.format(labour); $("material").textContent = money.format(material); $("printing").textContent = money.format(electricity + machine + failure); $("additional").textContent = money.format(extras + overhead); $("order").textContent = money.format(order); $("profit-result").textContent = money.format(profit);
}

async function refreshFiles() {
  const files = await window.druckpreis.listFiles(offerNumber());
  const list = $("file-list");
  list.replaceChildren();
  if (!files.length) {
    const item = document.createElement("li");
    item.textContent = "Keine Projektdateien vorhanden.";
    list.append(item);
    return;
  }
  for (const file of files) {
    const item = document.createElement("li");
    item.className = "project-file";
    const badge = document.createElement("span");
    badge.textContent = "3D";
    const name = document.createElement("strong");
    name.className = "project-file-name";
    name.textContent = file;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet remove-file";
    remove.textContent = "Entfernen";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Projektdatei „${file}“ aus diesem Angebot entfernen? Das Original bleibt erhalten.`)) return;
      try {
        await window.druckpreis.removeFile(offerNumber(), file);
        await refreshFiles();
        $("message").textContent = `Projektdatei entfernt: ${file}`;
      } catch {
        $("message").textContent = "Die Projektdatei konnte nicht entfernt werden.";
      }
    });
    item.append(badge, name, remove);
    list.append(item);
  }
}
function snapshot() { return Object.fromEntries([...document.querySelectorAll("input")].map((input) => [input.id, input.type === "checkbox" ? input.checked : input.value])); }
function applySnapshot(values) { for (const [id, value] of Object.entries(values || {})) { if (!$(id)) continue; if ($(id).type === "checkbox" && typeof value === "boolean") $(id).checked = value; else $(id).value = value; } calculate(); }
function normalizeItems(items, kind, fallback) {
  const source = Array.isArray(items) && items.length ? items : [fallback];
  return source.map((item) => ({ description: String(item.description || item.name || "Position").trim() || "Position", quantity: Math.max(1, Number(item.quantity) || 1), unitPrice: kind === "delivery" ? 0 : Math.max(0, Number(item.unitPrice ?? item.price) || 0), note: String(item.note || "").trim() }));
}
function normalizeConfirmation(value) {
  if (!value) return null;
  const fallback = { description: value.name, quantity: value.quantity, unitPrice: value.price, note: "" };
  return { ...value, invoiceItems: normalizeItems(value.invoiceItems, "invoice", fallback), deliveryItems: normalizeItems(value.deliveryItems, "delivery", fallback) };
}
function setConfirmation(value) {
  confirmation = normalizeConfirmation(value);
  const active = Boolean(confirmation);
  $("open-documents").disabled = !active;
  $("confirm-offer").textContent = active ? "Auftrag bestätigt" : "Angebot bestätigen";
  $("confirm-offer").disabled = active;
  document.querySelectorAll(".confirmed-tab").forEach((tab) => tab.classList.toggle("hidden", !active));
  $("order-status").classList.toggle("hidden", !active);
  if (active) { $("sales-order-status").textContent = "Auftrag bestätigt"; renderDocumentSummary(); renderDocumentItems("invoice"); renderDocumentItems("delivery"); renderDocumentTotal(); }
}
function setDocumentDates(value) {
  const fields = { "confirmation-date": value?.confirmationDate || "", "delivery-date": value?.deliveryDate || "", "invoice-date": value?.invoiceDate || "", "due-date": value?.dueDate || "", "sales-confirmation-date": value?.confirmationDate || "", "sales-delivery-date": value?.deliveryDate || "", "sales-confirmation-number": value?.confirmationNumber || "", "invoice-document-date": value?.invoiceDate || "", "invoice-due-date": value?.dueDate || "", "delivery-document-date": value?.deliveryDate || "", "delivery-note": value?.deliveryNote || "" };
  for (const [id, fieldValue] of Object.entries(fields)) if ($(id)) $(id).value = fieldValue;
  $("confirmation-summary").textContent = value ? `${value.confirmationNumber} · ${value.name} · ${value.quantity} Stk. · ${money.format(value.order)}` : "";
}
function renderDocumentSummary() { if (!confirmation) return; $("sales-order-number").textContent = confirmation.confirmationNumber || "—"; $("sales-order-customer").textContent = confirmation.customer?.name || "Kunde ergänzen"; $("sales-order-total").textContent = money.format(confirmation.order || 0); }
function renderDocumentItems(kind) {
  if (!confirmation) return;
  const key = kind === "invoice" ? "invoiceItems" : "deliveryItems";
  const container = $(kind === "invoice" ? "invoice-items" : "delivery-items");
  container.replaceChildren();
  confirmation[key].forEach((item, index) => {
    const row = document.createElement("div"); row.className = `document-item ${kind}`;
    const description = document.createElement("input"); description.className = "item-description"; description.value = item.description; description.setAttribute("aria-label", "Position");
    const quantity = document.createElement("input"); quantity.className = "item-quantity"; quantity.type = "number"; quantity.min = "1"; quantity.step = "1"; quantity.value = item.quantity; quantity.setAttribute("aria-label", "Menge");
    const detail = document.createElement("input"); detail.className = kind === "invoice" ? "item-price" : "item-note"; detail.type = kind === "invoice" ? "number" : "text"; if (kind === "invoice") { detail.min = "0"; detail.step = "0.05"; detail.value = item.unitPrice; } else { detail.placeholder = "Optional"; detail.value = item.note; } detail.setAttribute("aria-label", kind === "invoice" ? "Einzelpreis" : "Notiz");
    const remove = document.createElement("button"); remove.className = "remove-item"; remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `${item.description} entfernen`);
    const update = () => { item.description = description.value.trim() || "Position"; item.quantity = Math.max(1, Number(quantity.value) || 1); if (kind === "invoice") item.unitPrice = Math.max(0, Number(detail.value) || 0); else item.note = detail.value.trim(); renderDocumentTotal(); queueOrderSave(); };
    [description, quantity, detail].forEach((input) => input.addEventListener("input", update));
    remove.addEventListener("click", () => { if (confirmation[key].length === 1) return; confirmation[key].splice(index, 1); renderDocumentItems(kind); renderDocumentTotal(); queueOrderSave(); });
    row.append(description, quantity, detail, remove); container.append(row);
  });
}
function renderDocumentTotal() { if (!confirmation) return; const subtotal = confirmation.invoiceItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); const discount = subtotal * Math.min(Math.max(Number(confirmation.discountPercent) || 0, 0), 100) / 100; $("invoice-total").textContent = money.format(subtotal - discount); renderDocumentSummary(); }
function syncDocumentFields() { if (!confirmation) return; confirmation.confirmationDate = $("sales-confirmation-date").value || $("confirmation-date").value; confirmation.deliveryDate = $("sales-delivery-date").value || $("delivery-document-date").value; confirmation.invoiceDate = $("invoice-document-date").value || $("invoice-date").value; confirmation.dueDate = $("invoice-due-date").value || $("due-date").value; confirmation.deliveryNote = $("delivery-note").value.trim(); }
let orderSaveTimer;
function queueOrderSave() { if (!confirmation) return; syncDocumentFields(); clearTimeout(orderSaveTimer); orderSaveTimer = setTimeout(async () => { try { await window.druckpreis.saveOrder(confirmation); } catch { /* The next export retries the save. */ } }, 250); }
async function saveOrderDraft() { if (!confirmation) return; syncDocumentFields(); await window.druckpreis.saveOrder(confirmation); }
function addDocumentItem(kind) { if (!confirmation) return; const key = kind === "invoice" ? "invoiceItems" : "deliveryItems"; confirmation[key].push(kind === "invoice" ? { description: "Zusatzposition", quantity: 1, unitPrice: 0, note: "" } : { description: "Neue Lieferposition", quantity: 1, unitPrice: 0, note: "" }); renderDocumentItems(kind); renderDocumentTotal(); queueOrderSave(); }
async function loadOffer() { const saved = await window.druckpreis.loadOffer(offerNumber()); if (saved?.values) { applySnapshot(saved.values); $("save-status").textContent = "Gespeichertes Angebot geladen"; } setConfirmation(await window.druckpreis.loadConfirmation(offerNumber())); if (confirmation) setDocumentDates(confirmation); await refreshFiles(); }
function dateString(date) { return date.toISOString().slice(0, 10); }
function resetOffer(numberValue) { for (const [id, value] of Object.entries(defaultValues)) $(id).value = id === "offer-number" ? numberValue : value; const today = new Date(), valid = new Date(); valid.setDate(today.getDate() + 30); $("offer-date").value = dateString(today); $("valid-until").value = dateString(valid); $("file-list").innerHTML = "<li>Keine Projektdateien vorhanden.</li>"; $("save-status").textContent = "Noch nicht gespeichert"; setConfirmation(null); calculate(); }
async function saveCurrentOffer() { calculate(); await window.druckpreis.saveOffer(offerNumber(), { values: snapshot(), savedAt: new Date().toISOString() }); $("save-status").textContent = "Gespeichert"; }
function documentPayload() { syncDocumentFields(); return confirmation; }
async function exportDocument(kind, messageId = "document-message") { try { const payload = documentPayload(); await saveOrderDraft(); await window.druckpreis.saveSettings(settingsPayload()); const result = await window.druckpreis.exportOrderDocument(kind, payload); setConfirmation(result?.order || await window.druckpreis.loadConfirmation(offerNumber())); setDocumentDates(confirmation); $(messageId).textContent = `PDF erstellt: ${result?.path || "Dokument"}`; } catch { $(messageId).textContent = "Das Dokument konnte nicht erstellt werden."; } }
function cleanFooter(value) { const footer = String(value || "").trim(); return /druckpreis|excel|tool/i.test(footer) ? "Copyright © 2026 SY 3D" : footer || "Copyright © 2026 SY 3D"; }
function settingsPayload() {
  return { companyName: $("company-name").value.trim(), companyAddress: $("company-address").value.trim(), companyCity: $("company-city").value.trim(), companyEmail: $("company-email").value.trim(), companyPhone: $("company-phone").value.trim(), paymentTerms: number("payment-terms"), logoPosition: $("logo-position").value, logoWidth: number("logo-width"), pdfFormat: $("pdf-format").value, pdfFont: $("pdf-font").value, priceDisplay: $("price-display").value, pdfFooter: cleanFooter($("pdf-footer").value), showCompanyAddress: $("show-company-address").checked, showCustomerAddress: $("show-customer-address").checked, showDiscount: $("show-discount").checked, showCostSummary: $("show-cost-summary").checked, appearance: $("appearance").value };
}
function applySettings(settings) {
  $("company-name").value = settings.companyName || ""; $("company-address").value = settings.companyAddress || ""; $("company-city").value = settings.companyCity || ""; $("company-email").value = settings.companyEmail || ""; $("company-phone").value = settings.companyPhone || ""; $("payment-terms").value = settings.paymentTerms ?? 10; $("logo-position").value = settings.logoPosition || "top-right"; $("logo-width").value = settings.logoWidth ?? 74; $("pdf-format").value = settings.pdfFormat || "A4"; $("pdf-font").value = settings.pdfFont || "Helvetica"; $("price-display").value = settings.priceDisplay || "gross"; $("pdf-footer").value = cleanFooter(settings.pdfFooter); $("show-company-address").checked = settings.showCompanyAddress !== false; $("show-customer-address").checked = settings.showCustomerAddress !== false; $("show-discount").checked = settings.showDiscount !== false; $("show-cost-summary").checked = settings.showCostSummary !== false; $("logo-status").textContent = settings.logoPath ? `Logo hinterlegt: ${settings.logoPath.split(/[\\/]/).pop()}` : "Noch kein Logo hinterlegt.";
  applyAppearance(settings.appearance || "system");
  const address = [settings.companyAddress, settings.companyCity].filter(Boolean).join(" · "); $("footer-address").textContent = address || "Adresse ergänzen";
}
async function loadSettings() { applySettings(await window.druckpreis.getSettings()); }

$("upload").addEventListener("click", async () => { try { await window.druckpreis.addFiles(offerNumber()); await refreshFiles(); $("message").textContent = "Projektdateien wurden kopiert."; } catch { $("message").textContent = "Projektdateien konnten nicht gespeichert werden."; } });
$("export-pdf").addEventListener("click", async () => { calculate(); try { await window.druckpreis.saveSettings(settingsPayload()); await saveCurrentOffer(); const path = await window.druckpreis.exportPdf(current); $("message").textContent = `Angebot gespeichert und PDF erstellt: ${path}`; } catch { $("message").textContent = "Das Angebot oder PDF konnte nicht gespeichert werden."; } });
$("save-offer").addEventListener("click", async () => { try { await saveCurrentOffer(); $("message").textContent = "Angebot wurde gespeichert."; } catch { $("message").textContent = "Das Angebot konnte nicht gespeichert werden."; } });
$("new-offer").addEventListener("click", async () => { resetOffer(await window.druckpreis.nextOfferNumber()); activatePanel("calculator-panel"); });
$("confirm-offer").addEventListener("click", async () => { try { await window.druckpreis.saveSettings(settingsPayload()); await saveCurrentOffer(); calculate(); setConfirmation(await window.druckpreis.confirmOffer(current)); setDocumentDates(confirmation); activatePanel("sales-order-panel"); $("message").textContent = "Auftrag bestätigt. Sales order, Invoice und Delivery note sind jetzt verfügbar."; } catch { $("message").textContent = "Der Auftrag konnte nicht bestätigt werden."; } });
$("open-documents").addEventListener("click", () => { if (confirmation) { setDocumentDates(confirmation); $("documents-dialog").showModal(); } });
$("close-documents").addEventListener("click", () => $("documents-dialog").close());
$("export-confirmation").addEventListener("click", () => exportDocument("confirmation"));
$("export-delivery").addEventListener("click", () => exportDocument("delivery"));
$("export-invoice").addEventListener("click", () => exportDocument("invoice"));
$("generate-sales-order").addEventListener("click", () => exportDocument("confirmation", "sales-order-message"));
$("generate-invoice").addEventListener("click", () => exportDocument("invoice", "invoice-message"));
$("generate-delivery").addEventListener("click", () => exportDocument("delivery", "delivery-message"));
$("invoice-add-item").addEventListener("click", () => addDocumentItem("invoice"));
$("delivery-add-item").addEventListener("click", () => addDocumentItem("delivery"));
$("save-settings").addEventListener("click", async () => { try { applySettings(await window.druckpreis.saveSettings(settingsPayload())); $("settings-message").textContent = "Administration wurde gespeichert."; } catch { $("settings-message").textContent = "Die Administration konnte nicht gespeichert werden."; } });
$("choose-logo").addEventListener("click", async () => { try { applySettings(await window.druckpreis.chooseLogo()); } catch { $("settings-message").textContent = "Das Logo konnte nicht gespeichert werden."; } });
$("appearance").addEventListener("change", () => { applyAppearance($("appearance").value); $("settings-message").textContent = "Vorschau aktiv. Mit Administration speichern dauerhaft übernehmen."; });
function activatePanel(panelId) { const tab = document.querySelector(`.app-tab[data-panel="${panelId}"]`); if (tab && !tab.classList.contains("hidden")) tab.click(); }
document.querySelectorAll(".app-tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".app-tab").forEach((item) => item.classList.toggle("active", item === tab)); document.querySelectorAll(".app-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== tab.dataset.panel)); }));
$("open-folder").addEventListener("click", async () => window.druckpreis.openFolder(offerNumber()));
document.querySelectorAll("input").forEach((input) => input.addEventListener("input", calculate));
document.querySelectorAll("#calculator-panel input").forEach((input) => input.addEventListener("input", () => { $("save-status").textContent = "Ungespeicherte Änderungen"; }));
document.addEventListener("keydown", async (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s" || $("calculator-panel").classList.contains("hidden")) return;
  event.preventDefault();
  try { await saveCurrentOffer(); $("message").textContent = "Angebot wurde gespeichert."; }
  catch { $("message").textContent = "Das Angebot konnte nicht gespeichert werden."; }
});
$("offer-number").addEventListener("change", loadOffer);
[
  "confirmation-date", "delivery-date", "invoice-date", "due-date", "sales-confirmation-date", "sales-delivery-date", "invoice-document-date", "invoice-due-date", "delivery-document-date", "delivery-note",
].forEach((id) => { if ($(id)) $(id).addEventListener("input", queueOrderSave); });
resetOffer(defaultValues["offer-number"]); refreshFiles(); loadSettings();

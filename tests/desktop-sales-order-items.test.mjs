import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
const { normalizeOrder, syncFollowupItems } = createRequire(import.meta.url)("../desktop/order-items.cjs");

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.disabled = false;
    this.type = "text";
    this.value = "";
    this.textContent = "";
    this.className = "";
    this.classList = {
      values: new Set(),
      contains: (name) => this.classList.values.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.values.has(name) : force;
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
      },
    };
  }

  addEventListener(type, handler) { this.listeners.set(type, handler); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  insertAdjacentElement() {}
  async emit(type) { return this.listeners.get(type)?.({ preventDefault() {} }); }
}

async function rendererHarness() {
  const root = new URL("../", import.meta.url);
  const [html, source] = await Promise.all([
    readFile(new URL("desktop/index.html", root), "utf8"),
    readFile(new URL("desktop/renderer.js", root), "utf8"),
  ]);
  const elements = new Map();
  const tagged = [];
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new MockElement(match[1]);
    const type = match[0].match(/\btype="([^"]+)"/);
    const value = match[0].match(/\bvalue="([^"]*)"/);
    const classes = match[0].match(/\bclass="([^"]+)"/);
    if (type) element.type = type[1];
    if (value) element.value = value[1];
    if (classes) classes[1].split(/\s+/).forEach((name) => element.classList.values.add(name));
    element.id = match[2];
    elements.set(match[2], element);
    tagged.push(element);
  }
  elements.set("appearance", new MockElement("select"));

  const document = {
    documentElement: { dataset: {} },
    createElement: (tagName) => new MockElement(tagName),
    getElementById: (id) => elements.get(id),
    querySelector: (selector) => selector === ".settings-save" ? new MockElement() : null,
    querySelectorAll: (selector) => {
      if (selector === "input" || selector === "#calculator-panel input") return tagged.filter((element) => element.tagName === "INPUT");
      if (selector === ".confirmed-tab") return tagged.filter((element) => element.classList.contains("confirmed-tab"));
      if (selector === ".app-tab") return tagged.filter((element) => element.classList.contains("app-tab"));
      if (selector === ".app-panel") return tagged.filter((element) => element.classList.contains("app-panel"));
      return [];
    },
    addEventListener() {},
  };
  const media = { matches: false, addEventListener() {} };
  const savedOrders = [];
  const window = {
    DruckpreisOrderItems: { normalizeOrder, syncFollowupItems },
    matchMedia: () => media,
    confirm: () => true,
    druckpreis: {
      listFiles: async () => [],
      getSettings: async () => ({}),
      saveOrder: async (order) => { savedOrders.push(structuredClone(order)); return order; },
      nextOfferNumber: async () => "ANG-2026-002",
    },
  };
  const context = vm.createContext({ document, window, Intl, Date, Number, Math, Object, String, Boolean, Array, Set, clearTimeout, setTimeout });
  vm.runInContext(source, context, { filename: "desktop/renderer.js" });
  return { context, elements, savedOrders };
}

test("sales orders support saved description, quantity, and price rows", async () => {
  const { context, elements, savedOrders } = await rendererHarness();
  context.setConfirmation({
    name: "Grundposition",
    quantity: 2,
    price: 10,
    discountPercent: 10,
    customer: { name: "Muster AG" },
    confirmationNumber: "AB-2026-001",
  });

  const items = elements.get("sales-order-items");
  assert.equal(items.children.length, 1, "existing orders receive their original line as a fallback");

  await elements.get("sales-order-add-item").emit("click");
  assert.equal(items.children.length, 2);

  const [description, quantity, price] = items.children[1].children;
  description.value = "Zusatzhalterung";
  quantity.value = "3";
  price.value = "5";
  await description.emit("input");
  await quantity.emit("input");
  await price.emit("input");

  assert.equal(elements.get("sales-order-total").textContent, "CHF\u00a031.50");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(savedOrders.at(-1).confirmationItems.map(({ description, quantity, unitPrice, note }) => ({ description, quantity, unitPrice, note })), [
    { description: "Grundposition", quantity: 2, unitPrice: 10, note: "" },
    { description: "Zusatzhalterung", quantity: 3, unitPrice: 5, note: "" },
  ]);
  assert.equal(savedOrders.at(-1).subtotal, 35);
  assert.equal(savedOrders.at(-1).discountValue, 3.5);
  assert.equal(savedOrders.at(-1).order, 31.5);
});


test("all document date controls update the same saved value, including clearing dates", async () => {
  const { context, elements, savedOrders } = await rendererHarness();
  const order = { name: "Test", quantity: 1, price: 10, confirmationDate: "2026-09-09", deliveryDate: "2026-09-18", invoiceDate: "2026-09-18", dueDate: "2026-09-28" };
  context.setConfirmation(order); context.setDocumentDates(order);
  const groups = { deliveryDate: ["delivery-date", "sales-delivery-date", "delivery-document-date"], invoiceDate: ["invoice-date", "invoice-document-date"], dueDate: ["due-date", "invoice-due-date"], confirmationDate: ["confirmation-date", "sales-confirmation-date"] };
  for (const [key, ids] of Object.entries(groups)) {
    for (const id of ids) {
      for (const value of ["2026-10-01", ""]) {
        elements.get(id).value = value; await elements.get(id).emit("input");
        assert.equal(context.documentPayload()[key], value);
        for (const other of ids) assert.equal(elements.get(other).value, value);
      }
    }
  }
  await context.saveOrderDraft();
  assert.equal(savedOrders.at(-1).deliveryDate, "");
});

test("offer snapshots exclude administration and ignore legacy settings when loaded", async () => {
  const { context, elements } = await rendererHarness();
  elements.get("company-name").value = "Neue Firma";
  elements.get("logo-width").value = "148";
  const snapshot = context.snapshot();
  assert.ok("name" in snapshot);
  assert.equal("company-name" in snapshot, false);
  assert.equal("logo-width" in snapshot, false);
  context.applySnapshot({ name: "Geladen", "company-name": "Alte Firma", "logo-width": "74", "invoice-document-date": "2000-01-01" });
  assert.equal(elements.get("name").value, "Geladen");
  assert.equal(elements.get("company-name").value, "Neue Firma");
  assert.equal(elements.get("logo-width").value, "148");
  assert.notEqual(elements.get("invoice-document-date").value, "2000-01-01");
});

test("confirmed position changes reach invoice and delivery while custom edits survive", async () => {
  const { context, elements } = await rendererHarness();
  context.setConfirmation({ name: "Basis", quantity: 2, price: 10, discountPercent: 10 });
  await elements.get("sales-order-add-item").emit("click");
  const row = elements.get("sales-order-items").children[1];
  row.children[0].value = "Halterung"; row.children[1].value = "3"; row.children[2].value = "5";
  await row.children[2].emit("input");
  assert.equal(elements.get("invoice-total").textContent, "CHF\u00a031.50");
  assert.equal(context.documentPayload().deliveryItems[1].description, "Halterung");
  assert.equal(context.documentPayload().deliveryItems[1].quantity, 3);
  const invoice = elements.get("invoice-items").children[1];
  invoice.children[2].value = "7"; await invoice.children[2].emit("input");
  row.children[1].value = "4"; await row.children[1].emit("input");
  assert.equal(context.documentPayload().invoiceItems[1].unitPrice, 7);
  assert.equal(context.documentPayload().invoiceItems[1].quantity, 4);
  await elements.get("invoice-add-item").emit("click");
  await row.children[3].emit("click");
  assert.equal(context.documentPayload().invoiceItems.length, 2, "custom invoice extra is retained, removed source disappears");
  assert.equal(context.documentPayload().deliveryItems.length, 1);
  await context.saveOrderDraft();
});

test("debounced saves keep their original order when the active offer changes", async () => {
  const { context, savedOrders } = await rendererHarness();
  context.setConfirmation({ offerNumber: "ANG-A", name: "A", quantity: 1, price: 10 });
  context.queueOrderSave();
  context.setConfirmation({ offerNumber: "ANG-B", name: "B", quantity: 1, price: 20 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(savedOrders.at(-1).offerNumber, "ANG-A");
});

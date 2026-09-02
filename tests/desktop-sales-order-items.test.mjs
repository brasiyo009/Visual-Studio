import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  assert.deepEqual(savedOrders.at(-1).confirmationItems, [
    { description: "Grundposition", quantity: 2, unitPrice: 10, note: "" },
    { description: "Zusatzhalterung", quantity: 3, unitPrice: 5, note: "" },
  ]);
  assert.equal(savedOrders.at(-1).subtotal, 35);
  assert.equal(savedOrders.at(-1).discountValue, 3.5);
  assert.equal(savedOrders.at(-1).order, 31.5);
});

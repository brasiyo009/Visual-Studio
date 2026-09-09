import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const { normalizeOrder, syncFollowupItems } = createRequire(import.meta.url)("../desktop/order-items.cjs");

test("legacy orders acquire missing confirmed positions once and preserve custom extras", () => {
  const order = normalizeOrder({ name: "Basis", quantity: 2, price: 10,
    confirmationItems: [{ description: "Basis geändert", quantity: 3, unitPrice: 12 }, { description: "Halterung", quantity: 1, unitPrice: 5 }],
    invoiceItems: [{ description: "Basis", quantity: 2, unitPrice: 10 }, { description: "Versand", quantity: 1, unitPrice: 8 }],
    deliveryItems: [{ description: "Basis", quantity: 2, note: "Vorsichtig" }],
  });
  assert.equal(order.invoiceItems[0].description, "Basis geändert");
  assert.equal(order.invoiceItems[0].unitPrice, 12);
  assert.equal(order.invoiceItems.length, 3);
  assert.equal(order.deliveryItems.length, 2);
  assert.equal(order.deliveryItems[0].note, "Vorsichtig");
  assert.deepEqual(normalizeOrder(JSON.parse(JSON.stringify(order))), order);
});

test("intentional omissions and independently edited fields survive reload and source changes", () => {
  const order = normalizeOrder({ name: "Basis", quantity: 2, price: 10, confirmationItems: [{ description: "Basis", quantity: 2, unitPrice: 10 }, { description: "Extra", quantity: 1, unitPrice: 5 }] });
  order.invoiceItems[0].unitPrice = 9;
  order.invoiceOmittedItemIds = [order.invoiceItems.pop().sourceItemId];
  order.confirmationItems[0].quantity = 4;
  syncFollowupItems(order);
  assert.equal(order.invoiceItems[0].unitPrice, 9);
  assert.equal(order.invoiceItems[0].quantity, 4);
  assert.equal(order.invoiceItems.length, 1);
  assert.equal(normalizeOrder(order).invoiceItems.length, 1);
});

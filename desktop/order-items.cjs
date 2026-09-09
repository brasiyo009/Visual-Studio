/* Shared by the Electron main process and the renderer. */
(function (root) {
  function normalizeItem(item, delivery = false) {
    return { ...item, description: String(item.description || item.name || "Position").trim() || "Position", quantity: Math.max(1, Number(item.quantity) || 1), unitPrice: delivery ? 0 : Math.max(0, Number(item.unitPrice ?? item.price) || 0), note: String(item.note || "").trim() };
  }
  function sourceValues(item, delivery) {
    return { description: item.description, quantity: item.quantity, ...(delivery ? {} : { unitPrice: item.unitPrice }) };
  }
  function syncFollowupItems(order) {
    for (const kind of ["invoice", "delivery"]) {
      const key = `${kind}Items`, delivery = kind === "delivery";
      const sources = new Map(order.confirmationItems.map((item) => [item.id, item]));
      order[key] = order[key].filter((item) => !item.sourceItemId || sources.has(item.sourceItemId));
      for (const item of order[key]) {
        if (!item.sourceItemId) continue;
        const next = sourceValues(sources.get(item.sourceItemId), delivery);
        for (const field of Object.keys(next)) {
          if (item[field] === item.sourceValues?.[field]) item[field] = next[field];
        }
        item.sourceValues = next;
      }
      const linked = new Set(order[key].map((item) => item.sourceItemId));
      const omitted = new Set(order[`${kind}OmittedItemIds`] || []);
      for (const source of order.confirmationItems) {
        if (linked.has(source.id) || omitted.has(source.id)) continue;
        order[key].push({ ...normalizeItem(source, delivery), sourceItemId: source.id, sourceValues: sourceValues(source, delivery) });
      }
    }
    return order;
  }
  function normalizeOrder(value) {
    if (!value) return null;
    const fallback = normalizeItem({ description: value.name, quantity: value.quantity, unitPrice: value.price });
    const order = { ...value };
    order.confirmationItems = (value.confirmationItems?.length ? value.confirmationItems : [fallback]).map((item, index) => ({ ...normalizeItem(item), id: item.id || `confirmation-${index + 1}` }));
    order.nextItemId = Math.max(Number(order.nextItemId) || 1, ...order.confirmationItems.map((item) => (Number(item.id.replace("confirmation-", "")) || 0) + 1));
    for (const kind of ["invoice", "delivery"]) {
      const delivery = kind === "delivery", key = `${kind}Items`;
      order[key] = (Array.isArray(value[key]) ? value[key] : []).map((item) => normalizeItem(item, delivery));
      if (!value.followupItemsVersion) {
        const used = new Set();
        order[key].forEach((item, index) => {
          const source = order.confirmationItems.find((entry) => !used.has(entry.id) && entry.description === item.description)
            || (index === 0 && !used.has(order.confirmationItems[0].id) ? order.confirmationItems[0] : null);
          if (!source) return;
          used.add(source.id);
          item.sourceItemId = source.id;
          // Legacy first rows originated from the offer. Keep later manual overrides.
          item.sourceValues = sourceValues(index === 0 ? fallback : source, delivery);
        });
      }
    }
    order.followupItemsVersion = 1;
    return syncFollowupItems(order);
  }
  const api = { normalizeOrder, syncFollowupItems };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DruckpreisOrderItems = api;
})(globalThis);

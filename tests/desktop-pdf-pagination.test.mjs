import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Module, createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { PDFDocument, PDFPage } = require("pdf-lib");
const root = new URL("../", import.meta.url);
const mainPath = fileURLToPath(new URL("desktop/main.cjs", root));
const mainRequire = createRequire(mainPath);

async function pdfHarness() {
  const folder = await mkdtemp(path.join(tmpdir(), "druckpreis-pdf-test-"));
  const source = (await readFile(mainPath, "utf8")).split('if (process.env.DRUCKPREIS_PDF_SMOKE')[0];
  const entry = new Module(mainPath);
  entry.require = (name) => name === "electron" ? { app: { getPath: () => folder } } : mainRequire(name);
  entry._compile(`${source}\nmodule.exports = { createOfferPdf, createOrderDocumentPdf };`, mainPath);
  return { ...entry.exports, cleanup: () => rm(folder, { recursive: true, force: true }) };
}

const baseOrder = {
  offerNumber: "ANG-2026-001", confirmationNumber: "AB-2026-001", invoiceNumber: "RE-2026-001", deliveryNumber: "LS-2026-001",
  name: "Gehäuse", quantity: 1, price: 10, subtotal: 10, discountPercent: 10, discountValue: 1, order: 9,
  confirmationDate: "2026-09-09", deliveryDate: "2026-09-18", invoiceDate: "2026-09-18", dueDate: "2026-09-28",
  customer: { name: "Muster AG", address: "Werkstrasse 12", city: "8000 Zürich" },
};

test("A4/A5 order PDFs keep every row and total above the footer on numbered pages", async () => {
  const app = await pdfHarness();
  const original = PDFPage.prototype.drawText;
  let drawn = [];
  PDFPage.prototype.drawText = function (text, options) { drawn.push({ page: this, text, ...options }); return original.call(this, text, options); };
  try {
    for (const format of ["A4", "A5"]) for (const kind of ["confirmation", "invoice", "delivery"]) {
      const items = Array.from({ length: 40 }, (_, i) => ({ description: `Testposition ${String(i + 1).padStart(2, "0")}`, quantity: 1, unitPrice: 10 }));
      drawn = [];
      const bytes = await app.createOrderDocumentPdf(kind, { ...baseOrder, confirmationItems: items }, { pdfFormat: format });
      const pdf = await PDFDocument.load(bytes);
      assert.ok(pdf.getPageCount() > 1);
      const bottom = format === "A5" ? 60 : 74;
      for (const item of items) {
        const rows = drawn.filter((entry) => entry.text === item.description);
        assert.equal(rows.length, 1, `${format} ${kind}: ${item.description} appears exactly once`);
        assert.ok(rows[0].y >= bottom, "no row enters the footer");
      }
      if (kind !== "delivery") {
        const total = drawn.find((entry) => entry.text === "CHF 360.00");
        assert.ok(total && total.y >= bottom, "total remains visible");
      } else {
        assert.ok(drawn.find((entry) => entry.text === "Unterschrift Empfänger" && entry.y >= bottom));
      }
      assert.equal(drawn.filter((entry) => /^Seite \d+ \/ \d+$/.test(entry.text)).length, pdf.getPageCount());
    }
  } finally { PDFPage.prototype.drawText = original; await app.cleanup(); }
});

test("very long descriptions and delivery notes wrap across pages without clipping", async () => {
  const app = await pdfHarness();
  const original = PDFPage.prototype.drawText;
  const body = [];
  PDFPage.prototype.drawText = function (text, options) {
    if (text.includes("Beschreibung") || text.includes("Notiztext") || text.includes("ENDE")) body.push({ text, ...options });
    return original.call(this, text, options);
  };
  try {
    const pdf = await PDFDocument.load(await app.createOrderDocumentPdf("delivery", {
      ...baseOrder, confirmationItems: [{ description: "Beschreibung ".repeat(500) + "ENDE", quantity: 1, unitPrice: 10 }], deliveryNote: "Notiztext ".repeat(500) + "ENDE",
    }, { pdfFormat: "A5" }));
    assert.ok(pdf.getPageCount() > 3);
    assert.equal(body.filter((entry) => entry.text.includes("ENDE")).length, 2);
    for (const entry of body) assert.ok(entry.y >= 60, `${entry.text}: ${entry.y}`);
  } finally { PDFPage.prototype.drawText = original; await app.cleanup(); }
});

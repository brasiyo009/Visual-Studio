const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

let mainWindow;

function safeName(value, fallback = "Ohne_Angebotsnummer") {
  const clean = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return clean || fallback;
}

function offersRoot() {
  return path.join(app.getPath("documents"), "3D Druck Angebote", "Angebote");
}

const defaultAppSettings = {
  companyName: "Druckpreis", companyAddress: "", companyCity: "", companyEmail: "", companyPhone: "", paymentTerms: 10,
  logoPath: "", logoPosition: "top-right", logoWidth: 74, pdfFormat: "A4", pdfFont: "Helvetica", priceDisplay: "gross",
  pdfFooter: "Copyright © 2026 SY 3D", showCompanyAddress: true, showCustomerAddress: true, showDiscount: true, showCostSummary: true,
};

function settingsFolder() { return path.join(app.getPath("documents"), "3D Druck Angebote", "Einstellungen"); }
function settingsFile() { return path.join(settingsFolder(), "einstellungen.json"); }
async function storedLogoPath() {
  for (const extension of ["png", "jpg", "jpeg"]) {
    const candidate = path.join(settingsFolder(), `logo.${extension}`);
    try { await fs.access(candidate); return candidate; } catch { /* Try the next supported logo type. */ }
  }
  return "";
}
async function loadAppSettings() {
  let stored = {};
  try { stored = JSON.parse(await fs.readFile(settingsFile(), "utf8")); } catch { /* First run uses defaults. */ }
  const settings = { ...defaultAppSettings, ...stored };
  try { if (settings.logoPath) await fs.access(settings.logoPath); } catch { settings.logoPath = ""; }
  if (!settings.logoPath) settings.logoPath = await storedLogoPath();
  return settings;
}
async function saveAppSettings(settings) {
  await fs.mkdir(settingsFolder(), { recursive: true });
  // The Administration form does not submit the file path. Keep the stored logo when the other settings are saved.
  const saved = { ...defaultAppSettings, ...(await loadAppSettings()), ...settings };
  await fs.writeFile(settingsFile(), JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

async function offerFolders(offerNumber) {
  const root = path.join(offersRoot(), safeName(offerNumber));
  const folders = {
    root,
    files: path.join(root, "Projektdateien"),
    exports: path.join(root, "Exporte"),
    data: path.join(root, "Angebotsdaten"),
  };
  await Promise.all(Object.values(folders).map((folder) => fs.mkdir(folder, { recursive: true })));
  return folders;
}

async function uniquePath(folder, originalName) {
  const extension = path.extname(originalName);
  const basename = safeName(path.basename(originalName, extension), "Projektdatei");
  let index = 0;
  let target = path.join(folder, `${basename}${extension.toLowerCase()}`);
  while (true) {
    try { await fs.access(target); index += 1; target = path.join(folder, `${basename}-${index}${extension.toLowerCase()}`); }
    catch { return target; }
  }
}

function projectFileName(value) {
  const filename = String(value || "");
  if (!filename || filename !== path.basename(filename) || filename === "." || filename === "..") throw new Error("Ungültiger Dateiname");
  return filename;
}

function swissMoney(value) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(Number(value || 0));
}

function swissDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    ? new Intl.DateTimeFormat("de-CH").format(new Date(year, month - 1, day))
    : "—";
}

function pdfPageSize(format) { return format === "A5" ? [419.53, 595.28] : [595.28, 841.89]; }
function pdfFontNames(font) {
  if (font === "Times") return { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold };
  if (font === "Courier") return { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold };
  return { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold };
}
function priceLabel(settings) { return settings.priceDisplay === "net" ? "exkl. MWST" : "inkl. MWST"; }
function displayedPrice(value, order, settings) { return settings.priceDisplay === "net" ? Number(value || 0) / (1 + Number(order.vatRate || 0)) : Number(value || 0); }
function pdfLayout(page, format) {
  const compact = format === "A5";
  const width = page.getWidth(), height = page.getHeight(), margin = compact ? 28 : 42;
  return { width, height, margin, compact, top: height - margin, right: width - margin, titleSize: compact ? 22 : 28, bodySize: compact ? 9.5 : 11 };
}
function drawText(page, value, x, y, size, font, color) {
  page.drawText(String(value || "—"), { x, y, size, font, color });
}
function textWidth(font, value, size) { return font.widthOfTextAtSize(String(value || ""), size); }
function truncateText(font, value, size, maxWidth) {
  const source = String(value || "—");
  if (textWidth(font, source, size) <= maxWidth) return source;
  let result = "";
  for (const character of source) {
    if (textWidth(font, `${result}${character}…`, size) > maxWidth) break;
    result += character;
  }
  return `${result}…`;
}
function drawRight(page, value, right, y, size, font, color, maxWidth = right) {
  const output = truncateText(font, value, size, maxWidth);
  drawText(page, output, Math.max(0, right - textWidth(font, output, size)), y, size, font, color);
}
function drawRule(page, layout, y, color) {
  page.drawLine({ start: { x: layout.margin, y }, end: { x: layout.right, y }, thickness: 1, color });
}
async function drawLogo(pdf, page, settings, layout) {
  if (!settings.logoPath) return null;
  try {
    const bytes = await fs.readFile(settings.logoPath);
    const extension = path.extname(settings.logoPath).toLowerCase();
    const image = extension === ".png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const maxWidth = Math.min(Math.max(Number(settings.logoWidth) || 74, 20), layout.compact ? 96 : 140);
    const maxHeight = layout.compact ? 30 : 42;
    const dimensions = image.scale(Math.min(maxWidth / image.width, maxHeight / image.height));
    const x = settings.logoPosition === "top-left" ? layout.margin : layout.right - dimensions.width;
    const y = layout.top - dimensions.height;
    page.drawImage(image, { x, y, width: dimensions.width, height: dimensions.height });
    return { x, y, width: dimensions.width, height: dimensions.height, position: settings.logoPosition };
  } catch { /* A missing or unsupported logo must never block a document export. */ }
  return null;
}
function drawCompanyFooter(page, settings, layout, regular, muted, documentLabel, lineColor) {
  const fontSize = layout.compact ? 6.3 : 7;
  const lineY = layout.margin + (layout.compact ? 22 : 24);
  const textY = layout.margin - (layout.compact ? 1 : 0);
  drawRule(page, layout, lineY, lineColor);
  const configuredFooter = String(settings.pdfFooter || "").trim();
  const footer = truncateText(regular, /druckpreis|excel|tool/i.test(configuredFooter) ? "Copyright © 2026 SY 3D" : configuredFooter || "Copyright © 2026 SY 3D", fontSize, layout.compact ? 86 : 120);
  const origin = "Designed / Printed and supplied in Switzerland";
  const number = truncateText(regular, documentLabel, fontSize, layout.compact ? 74 : 105);
  drawText(page, footer, layout.margin, textY, fontSize, regular, muted);
  drawRight(page, origin, layout.right, textY + (layout.compact ? 10 : 11), layout.compact ? 5.8 : 6.5, regular, muted, layout.compact ? 150 : 220);
  drawRight(page, number, layout.right, textY, fontSize, regular, muted, layout.compact ? 74 : 105);
  if (settings.showCompanyAddress) {
    const company = ["SY 3D", settings.companyAddress, settings.companyCity, settings.companyEmail, settings.companyPhone].filter(Boolean).join(" · ");
    const companyStart = layout.margin + textWidth(regular, footer, fontSize) + 14;
    const companyEnd = layout.right - textWidth(regular, number, fontSize) - 14;
    if (company && companyEnd > companyStart + 24) drawText(page, truncateText(regular, company, fontSize, companyEnd - companyStart), companyStart, textY, fontSize, regular, muted);
  }
}

async function drawDocumentHeader(pdf, page, settings, layout, fonts, colors, title, number) {
  const logo = await drawLogo(pdf, page, settings, layout);
  const companyX = logo?.position === "top-left" ? Math.min(logo.x + logo.width + 10, layout.right - 100) : layout.margin;
  const companySize = layout.compact ? 8.5 : 11;
  const contactSize = layout.compact ? 6.7 : 8;
  const companyRight = logo?.position === "top-right" ? logo.x - 12 : layout.right;
  const companyWidth = Math.max(80, companyRight - companyX);
  drawText(page, truncateText(fonts.bold, (settings.companyName || "DRUCKPREIS").toUpperCase(), companySize, companyWidth), companyX, layout.top - 1, companySize, fonts.bold, colors.violet);
  const contactLines = [settings.companyAddress, settings.companyCity, [settings.companyEmail, settings.companyPhone].filter(Boolean).join(" · ")].filter(Boolean);
  contactLines.slice(0, 3).forEach((line, index) => drawText(page, truncateText(fonts.regular, line, contactSize, companyWidth), companyX, layout.top - 14 - index * (layout.compact ? 9 : 11), contactSize, fonts.regular, colors.muted));
  // Keep the title and document number below the logo and company-contact block.
  const logoTitleY = layout.top - (layout.compact ? 50 : 60);
  const contactTitleY = contactLines.length
    ? layout.top - 14 - (contactLines.length - 1) * (layout.compact ? 9 : 11) - layout.titleSize - (layout.compact ? 6 : 8)
    : logoTitleY;
  const titleY = Math.min(logoTitleY, contactTitleY);
  drawText(page, title, layout.margin, titleY, layout.titleSize, fonts.bold, colors.ink);
  drawRight(page, number, layout.right, titleY + 3, layout.compact ? 9 : 12, fonts.bold, colors.violet, layout.compact ? 104 : 145);
  return titleY - (layout.compact ? 50 : 60);
}
function drawAddressAndDates(page, layout, fonts, colors, customer, fields, startY, customerLabel) {
  const customerX = layout.margin, detailsX = layout.compact ? 242 : 340;
  const customerWidth = detailsX - customerX - 20;
  const labelSize = layout.compact ? 7.5 : 10, valueSize = layout.compact ? 10 : 13, detailValueSize = layout.compact ? 9 : 11;
  const address = customer || {};
  drawText(page, customerLabel, customerX, startY, labelSize, fonts.bold, colors.muted);
  if (address.name) drawText(page, truncateText(fonts.regular, address.name, valueSize, customerWidth), customerX, startY - 16, valueSize, fonts.regular, colors.ink);
  if (address.address) drawText(page, truncateText(fonts.regular, address.address, detailValueSize, customerWidth), customerX, startY - 31, detailValueSize, fonts.regular, colors.muted);
  if (address.city) drawText(page, truncateText(fonts.regular, address.city, detailValueSize, customerWidth), customerX, startY - 45, detailValueSize, fonts.regular, colors.muted);
  fields.forEach((field, index) => {
    const y = startY - index * (layout.compact ? 33 : 38);
    drawText(page, field.label, detailsX, y, labelSize, fonts.bold, colors.muted);
    drawText(page, swissDate(field.value), detailsX, y - (layout.compact ? 12 : 15), valueSize, fonts.regular, colors.ink);
  });
  return startY - Math.max(64, fields.length * (layout.compact ? 35 : 40) + 4);
}
function normalizedDocumentItems(kind, order) {
  const source = kind === "invoice" ? order.invoiceItems : kind === "delivery" ? order.deliveryItems : null;
  const items = Array.isArray(source) && source.length ? source : [{ description: order.name, quantity: order.quantity, unitPrice: order.price }];
  return items.map((item) => ({
    description: String(item.description || item.name || "Position").trim() || "Position",
    quantity: Math.max(1, Number(item.quantity) || 1),
    unitPrice: kind === "delivery" ? 0 : Math.max(0, Number(item.unitPrice ?? item.price) || 0),
    note: String(item.note || "").trim(),
  }));
}
function documentOrder(kind, order) {
  const documentItems = normalizedDocumentItems(kind, order);
  if (kind !== "invoice") return { ...order, documentItems };
  const subtotal = documentItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountPercent = Math.min(Math.max(Number(order.discountPercent) || 0, 0), 100);
  const discountValue = subtotal * discountPercent / 100;
  return { ...order, documentItems, subtotal, discountPercent, discountValue, order: subtotal - discountValue };
}
function drawLineItem(page, layout, fonts, colors, y, order, settings, includePrice = true) {
  const quantityX = layout.compact ? 250 : 365;
  const labelSize = layout.compact ? 7.5 : 10, valueSize = layout.compact ? 9.5 : 13;
  drawText(page, "Leistung", layout.margin, y, labelSize, fonts.bold, colors.muted);
  drawText(page, "Menge", quantityX, y, labelSize, fonts.bold, colors.muted);
  if (includePrice) drawRight(page, `Preis ${priceLabel(settings)}`, layout.right, y, labelSize, fonts.bold, colors.muted, layout.compact ? 112 : 135);
  let valueY = y - (layout.compact ? 19 : 24);
  for (const item of order.documentItems || [{ description: order.name, quantity: order.quantity, unitPrice: order.price }]) {
    drawText(page, truncateText(fonts.bold, item.description, valueSize, quantityX - layout.margin - 14), layout.margin, valueY, valueSize, fonts.bold, colors.ink);
    drawText(page, `${item.quantity} Stk.`, quantityX, valueY, valueSize, fonts.regular, colors.ink);
    if (includePrice) drawRight(page, swissMoney(displayedPrice(item.unitPrice, order, settings)), layout.right, valueY, valueSize, fonts.bold, colors.ink, layout.compact ? 112 : 135);
    if (item.note) {
      drawText(page, truncateText(fonts.regular, item.note, layout.compact ? 7 : 8, quantityX - layout.margin - 14), layout.margin, valueY - (layout.compact ? 11 : 14), layout.compact ? 7 : 8, fonts.regular, colors.muted);
      valueY -= layout.compact ? 11 : 14;
    }
    valueY -= layout.compact ? 22 : 28;
  }
  return valueY;
}
function drawTotals(page, layout, fonts, colors, y, order, settings, title) {
  const totalX = layout.compact ? 190 : 320;
  const bodySize = layout.compact ? 8.5 : 11;
  const amountSize = layout.compact ? 8.5 : 11;
  const titleSize = layout.compact ? 11 : 14;
  drawText(page, "Preisübersicht", layout.margin, y, titleSize, fonts.bold, colors.ink);
  y -= layout.compact ? 20 : 25;
  const drawTotalRow = (label, value) => {
    drawText(page, truncateText(fonts.regular, label, bodySize, layout.right - totalX - 82), totalX, y, bodySize, fonts.regular, colors.muted);
    drawRight(page, value, layout.right, y, amountSize, fonts.regular, colors.ink, layout.compact ? 94 : 112);
    y -= layout.compact ? 16 : 20;
  };
  drawTotalRow(`Zwischensumme ${priceLabel(settings)}`, swissMoney(displayedPrice(order.subtotal, order, settings)));
  if (settings.showDiscount) drawTotalRow(`Rabatt (${Number(order.discountPercent || 0).toFixed(1)} %)`, `- ${swissMoney(displayedPrice(order.discountValue, order, settings))}`);
  y -= layout.compact ? 3 : 6;
  const boxHeight = layout.compact ? 46 : 52, boxY = y - boxHeight;
  page.drawRectangle({ x: layout.margin, y: boxY, width: layout.right - layout.margin, height: boxHeight, color: colors.pale, borderColor: colors.line, borderWidth: 1 });
  const boxTextY = boxY + (layout.compact ? 18 : 20);
  drawText(page, `${title} ${priceLabel(settings)}`, layout.margin + (layout.compact ? 12 : 16), boxTextY, layout.compact ? 9 : 12, fonts.bold, colors.ink);
  drawRight(page, swissMoney(displayedPrice(order.order, order, settings)), layout.right - (layout.compact ? 12 : 16), boxTextY - 2, layout.compact ? 14 : 17, fonts.bold, colors.violet, layout.compact ? 105 : 125);
  return boxY - (layout.compact ? 18 : 22);
}

async function createOfferPdf(offer, settingsOverride) {
  const settings = { ...(await loadAppSettings()), ...(settingsOverride || {}) };
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(pdfPageSize(settings.pdfFormat));
  const names = pdfFontNames(settings.pdfFont);
  const fonts = { regular: await pdf.embedFont(names.regular), bold: await pdf.embedFont(names.bold) };
  const colors = { violet: rgb(0.33, 0.28, 0.86), ink: rgb(0.11, 0.1, 0.17), muted: rgb(0.42, 0.4, 0.48), pale: rgb(0.96, 0.95, 0.99), line: rgb(0.9, 0.89, 0.93) };
  const layout = pdfLayout(page, settings.pdfFormat);
  let y = await drawDocumentHeader(pdf, page, settings, layout, fonts, colors, "Angebot", safeName(offer.offerNumber));
  y = drawAddressAndDates(page, layout, fonts, colors, settings.showCustomerAddress ? offer.customer : {}, [{ label: "Angebotsdatum", value: offer.offerDate }, { label: "Gültig bis", value: offer.validUntil }], y, "Kunde");
  drawRule(page, layout, y, colors.line); y -= layout.compact ? 20 : 24;
  y = drawLineItem(page, layout, fonts, colors, y, offer, settings);
  drawRule(page, layout, y, colors.line); y -= layout.compact ? 18 : 22;
  if (settings.showCostSummary) {
    drawText(page, "Kostenübersicht", layout.margin, y, layout.compact ? 11 : 14, fonts.bold, colors.ink); y -= layout.compact ? 19 : 24;
    for (const item of offer.breakdown || []) {
      drawText(page, truncateText(fonts.regular, item.label, layout.compact ? 8.5 : 11, layout.right - layout.margin - 110), layout.margin, y, layout.compact ? 8.5 : 11, fonts.regular, colors.muted);
      drawRight(page, swissMoney(displayedPrice(item.value, offer, settings)), layout.right, y, layout.compact ? 8.5 : 11, fonts.regular, colors.ink, layout.compact ? 96 : 115);
      y -= layout.compact ? 16 : 22;
    }
  }
  y = drawTotals(page, layout, fonts, colors, y, offer, settings, "Angebotswert");
  const noteSize = layout.compact ? 7 : 9;
  drawText(page, "Der Preis berücksichtigt Material, Arbeitszeit, Druckbetrieb, Risiken,", layout.margin, y, noteSize, fonts.regular, colors.muted); y -= layout.compact ? 10 : 13;
  drawText(page, "Gemeinkosten, Zahlungsgebühren und den festgelegten Gewinnaufschlag.", layout.margin, y, noteSize, fonts.regular, colors.muted);
  drawCompanyFooter(page, settings, layout, fonts.regular, colors.muted, `Angebot ${safeName(offer.offerNumber)}`, colors.line);
  return pdf.save();
}

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function orderDocumentInfo(kind, order) {
  const suffix = String(order.confirmationNumber || order.offerNumber || "AB-000").replace(/^AB-/, "");
  const info = {
    confirmation: { title: "Auftragsbestätigung", number: order.confirmationNumber || `AB-${suffix}`, date: order.confirmationDate, filename: "Auftragsbestaetigung" },
    delivery: { title: "Lieferschein", number: order.deliveryNumber || `LS-${suffix}`, date: order.deliveryDate, filename: "Lieferschein" },
    invoice: { title: "Rechnung", number: order.invoiceNumber || `RE-${suffix}`, date: order.invoiceDate, filename: "Rechnung" },
  };
  return info[kind];
}

async function createOrderDocumentPdf(kind, order, settingsOverride) {
  const settings = { ...(await loadAppSettings()), ...(settingsOverride || {}) };
  const info = orderDocumentInfo(kind, order);
  if (!info) throw new Error("Ungültiger Dokumenttyp");
  const prepared = documentOrder(kind, order);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(pdfPageSize(settings.pdfFormat));
  const names = pdfFontNames(settings.pdfFont);
  const fonts = { regular: await pdf.embedFont(names.regular), bold: await pdf.embedFont(names.bold) };
  const colors = { violet: rgb(0.33, 0.28, 0.86), ink: rgb(0.11, 0.1, 0.17), muted: rgb(0.42, 0.4, 0.48), pale: rgb(0.96, 0.95, 0.99), line: rgb(0.9, 0.89, 0.93) };
  const layout = pdfLayout(page, settings.pdfFormat);
  let y = await drawDocumentHeader(pdf, page, settings, layout, fonts, colors, info.title, info.number);
  const dateFields = [{ label: kind === "delivery" ? "Lieferdatum" : "Datum", value: info.date }];
  if (kind === "confirmation") dateFields.push({ label: "Voraussichtliche Lieferung", value: order.deliveryDate });
  if (kind === "invoice") dateFields.push({ label: "Zahlbar bis", value: order.dueDate });
  y = drawAddressAndDates(page, layout, fonts, colors, settings.showCustomerAddress ? order.customer : {}, dateFields, y, "Empfänger");
  drawRule(page, layout, y, colors.line); y -= layout.compact ? 20 : 24;
  y = drawLineItem(page, layout, fonts, colors, y, prepared, settings, kind !== "delivery");
  drawRule(page, layout, y, colors.line); y -= layout.compact ? 18 : 22;
  if (kind === "delivery") {
    drawText(page, "Bestätigung der Lieferung", layout.margin, y, layout.compact ? 11 : 14, fonts.bold, colors.ink); y -= layout.compact ? 24 : 30;
    if (order.deliveryNote) { drawText(page, truncateText(fonts.regular, `Notiz: ${order.deliveryNote}`, layout.compact ? 8.5 : 11, layout.right - layout.margin), layout.margin, y, layout.compact ? 8.5 : 11, fonts.regular, colors.muted); y -= layout.compact ? 18 : 22; }
    drawText(page, "Die oben aufgeführte Ware wurde vollständig erhalten.", layout.margin, y, layout.compact ? 8.5 : 11, fonts.regular, colors.muted); y -= layout.compact ? 42 : 58;
    const signatureMiddle = layout.width * .53;
    page.drawLine({ start: { x: layout.margin, y }, end: { x: signatureMiddle - 16, y }, thickness: 1, color: colors.muted });
    page.drawLine({ start: { x: signatureMiddle + 16, y }, end: { x: layout.right, y }, thickness: 1, color: colors.muted });
    y -= layout.compact ? 11 : 14;
    drawText(page, "Ort, Datum", layout.margin, y, layout.compact ? 7 : 9, fonts.regular, colors.muted);
    drawText(page, "Unterschrift Empfänger", signatureMiddle + 16, y, layout.compact ? 7 : 9, fonts.regular, colors.muted);
  } else {
    y = drawTotals(page, layout, fonts, colors, y, prepared, settings, kind === "invoice" ? "Rechnungsbetrag" : "Auftragswert");
    drawText(page, kind === "invoice" ? "Bitte begleichen Sie den Rechnungsbetrag bis zum oben genannten Datum." : "Vielen Dank für Ihre Bestellung. Die Lieferung erfolgt gemäss Auftragsbestätigung.", layout.margin, y, layout.compact ? 7 : 9, fonts.regular, colors.muted);
  }
  drawCompanyFooter(page, settings, layout, fonts.regular, colors.muted, info.number, colors.line);
  return pdf.save();
}

async function writeOrderDocument(kind, order) {
  const info = orderDocumentInfo(kind, order);
  const folders = await offerFolders(order.offerNumber);
  const target = await uniquePath(folders.exports, `${info.number}_${info.filename}.pdf`);
  await fs.writeFile(target, await createOrderDocumentPdf(kind, order));
  const updated = { ...order, documents: { ...(order.documents || {}), [kind]: { createdAt: new Date().toISOString(), path: target } } };
  await fs.writeFile(path.join(folders.data, "auftragsbestaetigung.json"), JSON.stringify(updated, null, 2), "utf8");
  return { path: target, order: updated };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: "SY 3D Calculation",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

if (process.env.DRUCKPREIS_PDF_SMOKE === "1") {
  app.whenReady().then(async () => {
    const folder = path.join(process.cwd(), "tmp", "pdfs");
    const sample = { offerNumber: "ANG-2026-021", confirmationNumber: "AB-2026-021", deliveryNumber: "LS-2026-021", invoiceNumber: "RE-2026-021", name: "Präzisionsgehäuse", customer: { name: "Muster AG", address: "Werkstrasse 12", city: "8000 Zürich" }, offerDate: "2026-08-31", validUntil: "2026-09-30", confirmationDate: "2026-08-31", deliveryDate: "2026-09-10", invoiceDate: "2026-09-10", dueDate: "2026-09-20", quantity: 3, price: 42.5, subtotal: 127.5, discountPercent: 10, discountValue: 12.75, order: 114.75, breakdown: [{ label: "Arbeitszeit", value: 35.4 }, { label: "Material", value: 28.6 }, { label: "Druckbetrieb & Reserve", value: 19.2 }, { label: "Weitere Kosten", value: 8.1 }] };
    const sampleSettings = { companyName: "SY 3D", companyAddress: "Werkstrasse 4", companyCity: "8005 Zürich", companyEmail: "hallo@druckpreis.ch", companyPhone: "+41 44 555 12 34", paymentTerms: 10, logoPath: process.env.DRUCKPREIS_PDF_SMOKE_LOGO || "", logoPosition: "top-right", logoWidth: 74, pdfFont: "Helvetica", priceDisplay: "gross", pdfFooter: "Copyright © 2026 SY 3D", showCompanyAddress: true, showCustomerAddress: true, showDiscount: true, showCostSummary: true };
    await fs.mkdir(folder, { recursive: true });
    for (const format of ["A4", "A5"]) {
      const suffix = format.toLowerCase(), settings = { ...sampleSettings, pdfFormat: format };
      await fs.writeFile(path.join(folder, `angebot-${suffix}.pdf`), await createOfferPdf(sample, settings));
      await fs.writeFile(path.join(folder, `auftragsbestaetigung-${suffix}.pdf`), await createOrderDocumentPdf("confirmation", sample, settings));
      await fs.writeFile(path.join(folder, `lieferschein-${suffix}.pdf`), await createOrderDocumentPdf("delivery", sample, settings));
      await fs.writeFile(path.join(folder, `rechnung-${suffix}.pdf`), await createOrderDocumentPdf("invoice", sample, settings));
    }
    app.quit();
  });
} else {
app.whenReady().then(async () => {
  await fs.mkdir(offersRoot(), { recursive: true });
  await fs.mkdir(settingsFolder(), { recursive: true });
  ipcMain.handle("settings:get", async () => loadAppSettings());
  ipcMain.handle("settings:save", async (_event, settings) => saveAppSettings(settings));
  ipcMain.handle("settings:choose-logo", async (event) => {
    const selection = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: "Logo auswählen", properties: ["openFile"], filters: [{ name: "Bilddateien", extensions: ["png", "jpg", "jpeg"] }] });
    if (selection.canceled) return await loadAppSettings();
    const source = selection.filePaths[0], extension = path.extname(source).toLowerCase();
    const target = path.join(settingsFolder(), `logo${extension}`);
    await fs.copyFile(source, target);
    return saveAppSettings({ ...(await loadAppSettings()), logoPath: target });
  });
  ipcMain.handle("offer:list-files", async (_event, offerNumber) => {
    const folders = await offerFolders(offerNumber);
    const entries = await fs.readdir(folders.files, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  });
  ipcMain.handle("offer:add-files", async (event, offerNumber) => {
    const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: "Projektdateien auswählen", properties: ["openFile", "multiSelections"], filters: [{ name: "3D-Projektdateien", extensions: ["step", "stp", "3mf"] }] });
    if (selected.canceled) return [];
    const folders = await offerFolders(offerNumber);
    for (const source of selected.filePaths) {
      const target = await uniquePath(folders.files, path.basename(source));
      await fs.copyFile(source, target);
    }
    const entries = await fs.readdir(folders.files, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  });
  ipcMain.handle("offer:remove-file", async (_event, offerNumber, filename) => {
    const folders = await offerFolders(offerNumber);
    await fs.unlink(path.join(folders.files, projectFileName(filename)));
    return true;
  });
  ipcMain.handle("offer:export-pdf", async (_event, offer) => {
    const folders = await offerFolders(offer.offerNumber);
    const filename = `${safeName(offer.offerNumber)}_Angebot.pdf`;
    const target = await uniquePath(folders.exports, filename);
    await fs.writeFile(target, await createOfferPdf(offer));
    return target;
  });
  ipcMain.handle("offer:save", async (_event, offerNumber, offer) => {
    const folders = await offerFolders(offerNumber);
    await fs.writeFile(path.join(folders.data, "angebot.json"), JSON.stringify(offer, null, 2), "utf8");
    return true;
  });
  ipcMain.handle("offer:load", async (_event, offerNumber) => {
    try { return JSON.parse(await fs.readFile(path.join((await offerFolders(offerNumber)).data, "angebot.json"), "utf8")); }
    catch { return null; }
  });
  ipcMain.handle("offer:next-number", async () => {
    const year = new Date().getFullYear();
    const prefix = `ANG-${year}-`;
    const entries = await fs.readdir(offersRoot(), { withFileTypes: true });
    const highest = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).map((entry) => Number(entry.name.slice(prefix.length))).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);
    return `${prefix}${String(highest + 1).padStart(3, "0")}`;
  });
  ipcMain.handle("order:confirm", async (_event, offer) => {
    const folders = await offerFolders(offer.offerNumber);
    const confirmationFile = path.join(folders.data, "auftragsbestaetigung.json");
    try { return JSON.parse(await fs.readFile(confirmationFile, "utf8")); }
    catch {
      const settings = await loadAppSettings();
      const suffix = String(offer.offerNumber || "ANG-000").replace(/^ANG-/, "");
      const confirmed = { ...offer, confirmationNumber: `AB-${suffix}`, deliveryNumber: `LS-${suffix}`, invoiceNumber: `RE-${suffix}`, confirmationDate: isoDate(), deliveryDate: "", invoiceDate: isoDate(), dueDate: isoDate(Number(settings.paymentTerms) || 10), confirmedAt: new Date().toISOString(), invoiceItems: [{ description: offer.name, quantity: offer.quantity, unitPrice: offer.price }], deliveryItems: [{ description: offer.name, quantity: offer.quantity, note: "" }], documents: {} };
      return (await writeOrderDocument("confirmation", confirmed)).order;
    }
  });
  ipcMain.handle("order:load", async (_event, offerNumber) => {
    try { return JSON.parse(await fs.readFile(path.join((await offerFolders(offerNumber)).data, "auftragsbestaetigung.json"), "utf8")); }
    catch { return null; }
  });
  ipcMain.handle("order:save", async (_event, order) => {
    const folders = await offerFolders(order.offerNumber);
    await fs.writeFile(path.join(folders.data, "auftragsbestaetigung.json"), JSON.stringify(order, null, 2), "utf8");
    return order;
  });
  ipcMain.handle("order:export-document", async (_event, kind, order) => {
    if (!new Set(["confirmation", "delivery", "invoice"]).has(kind)) throw new Error("Ungültiger Dokumenttyp");
    return writeOrderDocument(kind, order);
  });
  ipcMain.handle("offer:open-folder", async (_event, offerNumber) => shell.openPath((await offerFolders(offerNumber)).root));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

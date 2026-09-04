import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_LOGO_WIDTH, LOGO_SIZE_VERSION, logoBounds, normalizeLogoSettings } = require("../desktop/pdf-layout.cjs");

test("legacy PDF logo widths migrate to exactly double their saved size once", () => {
  assert.equal(DEFAULT_LOGO_WIDTH, 148);
  assert.deepEqual(normalizeLogoSettings({ logoWidth: 74 }), { logoWidth: 148, logoSizeVersion: LOGO_SIZE_VERSION });
  assert.deepEqual(normalizeLogoSettings({ logoWidth: 90 }), { logoWidth: 180, logoSizeVersion: LOGO_SIZE_VERSION });
  assert.deepEqual(
    normalizeLogoSettings({ logoWidth: 148, logoSizeVersion: LOGO_SIZE_VERSION }),
    { logoWidth: 148, logoSizeVersion: LOGO_SIZE_VERSION },
  );
});

test("A4 and A5 PDF logo bounds are doubled", () => {
  assert.deepEqual(logoBounds({ logoWidth: DEFAULT_LOGO_WIDTH }, false), { maxWidth: 148, maxHeight: 84 });
  assert.deepEqual(logoBounds({ logoWidth: DEFAULT_LOGO_WIDTH }, true), { maxWidth: 148, maxHeight: 60 });
  assert.deepEqual(logoBounds({ logoWidth: 999 }, false), { maxWidth: 280, maxHeight: 84 });
  assert.deepEqual(logoBounds({ logoWidth: 999 }, true), { maxWidth: 192, maxHeight: 60 });
});

test("the Administration form exposes the new default and range", async () => {
  const root = new URL("../", import.meta.url);
  const [html, renderer] = await Promise.all([
    readFile(new URL("desktop/index.html", root), "utf8"),
    readFile(new URL("desktop/renderer.js", root), "utf8"),
  ]);
  assert.match(html, /id="logo-width"[^>]*max="280"[^>]*value="148"/);
  assert.match(renderer, /settings\.logoWidth \?\? 148/);
});

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// One atomic catalogue file keeps product metadata and imported pictures together.
// Originals are never referenced, and interrupted writes leave the previous file intact.
function createCatalogue(root, normalizeImage) {
  const file = path.join(root, 'katalog.json');
  let queue = Promise.resolve();
  async function list() {
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.products)) throw new Error('Ungültiges Katalogformat.');
      return data.products;
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  function save(input) {
    const operation = queue.then(async () => {
      const products = await list();
      const text = (key, max = 200) => String(input[key] ?? '').trim().slice(0, max);
      const name = text('name');
      if (!name || input.price === '' || !Number.isFinite(Number(input.price)) || Number(input.price) < 0 || Number(input.price) > 10000000) throw new Error('Name und gültigen Preis angeben.');
      if (!['included', 'excluded', 'none'].includes(input.vat)) throw new Error('MWST-Angabe fehlt.');
      if (!Array.isArray(input.photos) || input.photos.length > 8) throw new Error('Maximal 8 Fotos pro Produkt.');
      const existing = input.id ? products.find(p => p.id === input.id) : null;
      if (input.id && !existing) throw new Error('Produkt nicht gefunden.');
      const photos = [];
      for (const photo of input.photos) {
        if (typeof photo !== 'string' || photo.length > 14 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) throw new Error('Ungültiges Foto (PNG, JPG oder WebP, max. 10 MB).');
        photos.push(existing?.photos.includes(photo) ? photo : await normalizeImage(photo));
      }
      const product = { id: existing?.id || randomUUID(), name, price: Math.round(Number(input.price) * 100) / 100, startingFrom: input.startingFrom === true, vat: input.vat, description: text('description', 5000), category: text('category'), material: text('material'), colour: text('colour'), dimensions: text('dimensions'), archived: input.archived === true, photos, updatedAt: new Date().toISOString() };
      const next = existing ? products.map(p => p.id === product.id ? product : p) : [...products, product];
      await fs.mkdir(root, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify({ version: 1, products: next }, null, 2), 'utf8');
        await fs.rename(temporary, file);
      } finally { await fs.rm(temporary, { force: true }); }
      return product;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { list, save };
}
module.exports = { createCatalogue };

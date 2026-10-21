import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
const { createCatalogue } = createRequire(import.meta.url)('../desktop/catalogue.cjs');
const picture = 'data:image/png;base64,aGVsbG8=';
const product = { name: 'Vase', price: '25.50', vat: 'included', photos: [picture], category: 'Deko', material: 'PLA' };
async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'druckpreis-catalogue-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createCatalogue(root, data => data) };
}
test('catalogue persists images, price and details across restart, edits, archive and restore', async t => {
  const { root, store } = await setup(t);
  assert.deepEqual(await store.list(), []);
  const saved = await store.save(product);
  const reopened = createCatalogue(root, () => { throw Error('Existing image must be preserved'); });
  assert.deepEqual(await reopened.list(), [saved]);
  const archived = await reopened.save({ ...saved, name: 'Neue Vase', price: 30, archived: true });
  assert.equal(archived.archived, true);
  assert.deepEqual(archived.photos, [picture]);
  await reopened.save({ ...archived, archived: false });
  assert.equal((await reopened.list())[0].archived, false);
});
test('duplicate has independent identity; concurrent writes retain both products', async t => {
  const { store } = await setup(t);
  const [a, b] = await Promise.all([store.save(product), store.save({ ...product, name: 'Kopie' })]);
  assert.notEqual(a.id, b.id);
  await store.save({ ...a, price: 99 });
  const rows = await store.list();
  assert.equal(rows.length, 2);
  assert.equal(rows.find(p => p.id === b.id).price, 25.5);
});
test('invalid products and images do not overwrite saved data and the save queue recovers', async t => {
  const { store } = await setup(t);
  const saved = await store.save(product);
  for (const changes of [{ name: ' ' }, { price: '' }, { price: -1 }, { price: 'no' }, { vat: 'invalid' }, { photos: Array(9).fill(picture) }, { photos: ['file:///etc/passwd'] }, { id: '../escape' }]) {
    await assert.rejects(store.save({ ...saved, ...changes }));
    assert.deepEqual(await store.list(), [saved]);
  }
  await store.save({ ...saved, photos: [] });
  assert.deepEqual((await store.list())[0].photos, []);
});
test('corrupt catalogue is reported and never silently replaced', async t => {
  const { root, store } = await setup(t);
  await writeFile(path.join(root, 'katalog.json'), 'broken');
  await assert.rejects(store.list());
  await assert.rejects(store.save(product));
  assert.equal(await readFile(path.join(root, 'katalog.json'), 'utf8'), 'broken');
});

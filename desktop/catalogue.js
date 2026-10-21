(() => {
  const byId = id => document.getElementById(id);
  const api = window.druckpreis;
  const form = byId('catalogue-form');
  const editor = byId('catalogue-dialog');
  const detail = byId('catalogue-detail');
  const currency = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' });
  const vatLabels = { included: 'inkl. MWST', excluded: 'exkl. MWST', none: 'Keine MWST' };
  let products = [], draft = {}, selected = null, dirty = false, busy = false;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function photo(src, name) {
    const img = element('img'); img.src = src; img.alt = name; img.loading = 'lazy'; return img;
  }
  function price(product) { return `${product.startingFrom ? 'ab ' : ''}${currency.format(product.price)}`; }
  function updateFilters() {
    for (const key of ['category', 'material']) {
      const select = byId(`catalogue-${key}`), previous = select.value;
      select.replaceChildren(new Option(key === 'category' ? 'Alle Kategorien' : 'Alle Materialien', ''));
      [...new Set(products.map(p => p[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'de')).forEach(value => select.add(new Option(value, value)));
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
    }
  }
  function render() {
    const query = byId('catalogue-search').value.trim().toLocaleLowerCase('de');
    const category = byId('catalogue-category').value, material = byId('catalogue-material').value;
    const archived = byId('catalogue-status').value === 'archived';
    const filtered = products.filter(p => p.archived === archived && (!category || p.category === category) && (!material || p.material === material) && `${p.name} ${p.description}`.toLocaleLowerCase('de').includes(query)).sort((a,b) => a.name.localeCompare(b.name, 'de'));
    byId('catalogue-message').textContent = filtered.length ? `${filtered.length} Produkte` : (products.length ? 'Keine passenden Produkte. Passe die Filter an oder füge ein Produkt hinzu.' : 'Dein Katalog ist noch leer. Füge deinen ersten Druck mit Bild und Preis hinzu.');
    byId('catalogue-grid').replaceChildren(...filtered.map(product => {
      const card = element('button', undefined, 'catalogue-card'); card.type = 'button';
      card.append(product.photos.length ? photo(product.photos[0], product.name) : element('div', '3D · Ohne Foto', 'catalogue-placeholder'));
      const content = element('div', undefined, 'catalogue-card-content');
      content.append(element('h2', product.name), element('p', [product.category, product.material].filter(Boolean).join(' · ') || '3D-Druck'), element('strong', price(product)), element('small', `${vatLabels[product.vat]} · pro Stück`));
      card.append(content); card.addEventListener('click', () => showDetail(product)); return card;
    }));
  }
  async function load() {
    byId('catalogue-retry').classList.add('hidden');
    try { products = await api.listCatalogue(); updateFilters(); render(); byId('catalogue-add').disabled = false; }
    catch { byId('catalogue-message').textContent = 'Katalog konnte nicht geladen werden. Bitte erneut versuchen. Gespeicherte Daten werden nicht überschrieben.'; byId('catalogue-retry').classList.remove('hidden'); }
  }
  function remember(product) {
    const index = products.findIndex(p => p.id === product.id);
    if (index < 0) products.push(product); else products[index] = product;
    updateFilters(); render();
  }
  function showDetail(product) {
    selected = product;
    byId('catalogue-detail-title').textContent = product.name;
    const body = byId('catalogue-detail-body'); body.replaceChildren();
    const gallery = element('div', undefined, 'catalogue-detail-photos');
    product.photos.forEach(src => gallery.append(photo(src, product.name)));
    body.append(gallery, element('h3', `${price(product)} · ${vatLabels[product.vat]} · pro Stück`));
    const specs = element('dl', undefined, 'catalogue-specs');
    for (const [key, label] of [['category','Kategorie'],['material','Material'],['colour','Farbe'],['dimensions','Abmessungen']]) {
      if (product[key]) specs.append(element('dt', label), element('dd', product[key]));
    }
    body.append(specs, element('p', product.description, 'catalogue-description-text'));
    byId('catalogue-archive').textContent = product.archived ? 'Wiederherstellen' : 'Archivieren';
    byId('catalogue-detail-message').textContent = '';
    detail.showModal();
  }
  function renderPhotos() {
    byId('catalogue-photos').replaceChildren(...draft.photos.map((src, index) => {
      const item = element('div', undefined, 'catalogue-photo'); item.append(photo(src, `Foto ${index + 1}`));
      const cover = element('button', index === 0 ? 'Titelbild' : 'Als Titelbild', 'quiet'); cover.type = 'button'; cover.disabled = index === 0;
      cover.addEventListener('click', () => { draft.photos.unshift(draft.photos.splice(index, 1)[0]); dirty = true; renderPhotos(); });
      const remove = element('button', 'Entfernen', 'quiet'); remove.type = 'button'; remove.setAttribute('aria-label', `Foto ${index + 1} entfernen`);
      remove.addEventListener('click', () => { draft.photos.splice(index, 1); dirty = true; renderPhotos(); });
      item.append(cover, remove); return item;
    }));
  }
  function edit(product, duplicate = false) {
    detail.close(); form.reset();
    draft = product ? { ...product, photos: [...product.photos] } : { photos: [], archived: false, vat: 'included' };
    if (duplicate) { delete draft.id; draft.name = `${draft.name} (Kopie)`.slice(0, 200); draft.archived = false; }
    for (const key of ['name', 'price', 'description', 'category', 'material', 'colour', 'dimensions', 'vat']) form.elements.namedItem(key).value = draft[key] ?? '';
    form.elements.namedItem('priceType').value = draft.startingFrom ? 'from' : 'fixed';
    byId('catalogue-title').textContent = draft.id ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
    byId('catalogue-editor-message').textContent = ''; dirty = false; renderPhotos(); editor.showModal();
  }
  function closeEditor(event) {
    if (busy || (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?'))) { event?.preventDefault(); return; }
    editor.close();
  }
  async function importPhotos(files) {
    if (busy) return;
    busy = true; byId('catalogue-fields').disabled = true;
    try {
      const incoming = [...files];
      if (draft.photos.length + incoming.length > 8) throw new Error('Maximal 8 Fotos pro Produkt.');
      const photos = [];
      for (const file of incoming) {
        if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Bitte PNG, JPG oder WebP mit maximal 10 MB pro Foto wählen.');
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden.')); reader.readAsDataURL(file); });
        const image = new Image(); image.src = data;
        try { await image.decode(); } catch { throw new Error('Eine Datei enthält kein lesbares Foto.'); }
        photos.push(data);
      }
      draft.photos.push(...photos); dirty = true; renderPhotos(); byId('catalogue-editor-message').textContent = 'Fotos hinzugefügt. Mit Produkt speichern übernehmen.';
    } catch (error) { byId('catalogue-editor-message').textContent = error.message; }
    finally { busy = false; byId('catalogue-fields').disabled = false; byId('catalogue-files').value = ''; }
  }
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(form);
    const product = { ...draft, ...Object.fromEntries(data), startingFrom: data.get('priceType') === 'from' };
    busy = true; byId('catalogue-fields').disabled = true;
    try { const saved = await api.saveCatalogueProduct(product); remember(saved); dirty = false; editor.close(); byId('catalogue-message').textContent = `${saved.name} gespeichert.`; }
    catch { byId('catalogue-editor-message').textContent = 'Produkt konnte nicht gespeichert werden. Prüfe Name, Preis und Fotos und versuche es erneut. Deine Eingaben bleiben erhalten.'; }
    finally { busy = false; byId('catalogue-fields').disabled = false; }
  });
  byId('catalogue-files').addEventListener('change', event => importPhotos(event.target.files));
  const drop = byId('catalogue-drop');
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); importPhotos(event.dataTransfer.files); });
  // Prevent dropped files outside the import target from navigating the Electron window.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  byId('catalogue-add').addEventListener('click', () => edit());
  byId('catalogue-close').addEventListener('click', closeEditor); editor.addEventListener('cancel', closeEditor);
  byId('catalogue-detail-close').addEventListener('click', () => detail.close());
  byId('catalogue-edit').addEventListener('click', () => edit(selected));
  byId('catalogue-duplicate').addEventListener('click', () => edit(selected, true));
  byId('catalogue-archive').addEventListener('click', async () => {
    const button = byId('catalogue-archive'); button.disabled = true;
    try { remember(await api.saveCatalogueProduct({ ...selected, archived: !selected.archived })); detail.close(); }
    catch { byId('catalogue-detail-message').textContent = 'Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.'; }
    finally { button.disabled = false; }
  });
  for (const id of ['search','category','material','status']) byId(`catalogue-${id}`).addEventListener(id === 'search' ? 'input' : 'change', render);
  byId('catalogue-retry').addEventListener('click', load);
  window.addEventListener('beforeunload', event => { if (dirty && editor.open) { event.preventDefault(); event.returnValue = ''; } });
  load();
})();

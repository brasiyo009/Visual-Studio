const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("druckpreis", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseLogo: () => ipcRenderer.invoke("settings:choose-logo"),
  listFiles: (offerNumber) => ipcRenderer.invoke("offer:list-files", offerNumber),
  addFiles: (offerNumber) => ipcRenderer.invoke("offer:add-files", offerNumber),
  removeFile: (offerNumber, filename) => ipcRenderer.invoke("offer:remove-file", offerNumber, filename),
  exportPdf: (offer) => ipcRenderer.invoke("offer:export-pdf", offer),
  saveOffer: (offerNumber, offer) => ipcRenderer.invoke("offer:save", offerNumber, offer),
  loadOffer: (offerNumber) => ipcRenderer.invoke("offer:load", offerNumber),
  nextOfferNumber: () => ipcRenderer.invoke("offer:next-number"),
  confirmOffer: (offer) => ipcRenderer.invoke("order:confirm", offer),
  saveOrder: (order) => ipcRenderer.invoke("order:save", order),
  loadConfirmation: (offerNumber) => ipcRenderer.invoke("order:load", offerNumber),
  exportOrderDocument: (kind, order) => ipcRenderer.invoke("order:export-document", kind, order),
  openFolder: (offerNumber) => ipcRenderer.invoke("offer:open-folder", offerNumber),
});

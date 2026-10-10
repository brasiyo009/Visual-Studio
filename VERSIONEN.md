# Versionshistorie

## PreFinal - 10.10.2026

- Vollstaendige Funktions- und Regressionspruefung des aktuellen Programmstands 0.2.8.
- Desktop-Testpaket: 12 von 12 Tests bestanden.
- Web-Build und Render-Test: bestanden.
- ESLint-Pruefung: bestanden.
- Electron-PDF-Smoke-Test: Angebot, Auftragsbestaetigung, Lieferschein und Rechnung wurden in A4 und A5 erfolgreich erzeugt.
- Funktionsdokumentation als PDF ergaenzt.
- Bekannte Einschraenkungen bleiben unveraendert: Die macOS-App ist ad hoc signiert, aber nicht mit einer Apple Developer ID signiert oder notarisiert. Die Intel-Ausgabe wurde nicht auf echter Intel-Hardware gestartet.

Der Eintrag "PreFinal" dokumentiert den geprueften Stand. Die technische App-Version bleibt 0.2.8, damit keine neue Installationsversion vorgetaeuscht wird.

## 0.2.8 - 09.09.2026

- macOS-App und eingebettete Komponenten ad hoc signiert.
- Signaturpruefung in den Paketbau aufgenommen.
- DMG-Installationspakete fuer Apple Silicon und Intel erstellt.
- Installations- und Gatekeeper-Hinweise aktualisiert.

## 0.2.7 - 09.09.2026

- PDF-Seitenumbruch fuer A4 und A5 verbessert, inklusive langer Beschreibungen und Notizen.
- Positionen der Auftragsbestaetigung mit Rechnung und Lieferschein synchronisiert.
- Eigene Ergaenzungen, Aenderungen und bewusste Entfernungen bleiben erhalten.
- Dokumentdaten vereinheitlicht und Speichern/Laden robuster gemacht.

## 0.2.6 - 02.09.2026

- Bearbeitbare Positionen fuer bestaetigte Auftraege eingefuehrt.
- Beschreibung, Menge und Einzelpreis koennen angepasst und gespeichert werden.
- Summen und Rabatte werden fuer die Auftragsbestaetigung neu berechnet.

## 0.2.5 - 02.09.2026

- Erster in Git dokumentierter Programmstand.
- Grundfunktionen fuer Kalkulation, Angebote und Auftragsdokumente.

## GitHub-Stand bei der Pruefung

- Repository: `brasiyo009/Visual-Studio`
- Branch `main`: Commit `02c9eb40bcb47e6996c9f4beb662189a07829d34` (vor dem PreFinal-Eintrag)
- Vorhandener Git-Tag: `v0.2.7`
- Die Versionen 0.2.5, 0.2.6 und 0.2.8 sind ueber Commits beziehungsweise Paketmetadaten nachvollziehbar, besitzen aber keinen eigenen Git-Tag.

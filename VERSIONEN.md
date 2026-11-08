# Versionshistorie

## Installationsprüfung 0.3.0 - 08.11.2026

- Apple-Silicon-Installer neu gebaut und direkt unter `Dokumente/3D Print/Druckpreis-Installation.dmg` abgelegt.
- Der Paketbau aktualisiert diese leicht auffindbare Kopie künftig automatisch für die Architektur des Build-Macs. Versionierte Pakete bleiben unter `release/macos/`.
- Desktop-Tests: 16 von 16 bestanden. ESLint sowie Web-Build und Render-Test bestanden.
- Gepackte App-Dateien in Electron mit isolierten Testdaten geprüft: Kalkulation (Startpreis CHF 87.00), Angebot speichern/laden, Auftrag bestätigen und alle vier PDF-Dokumentarten in A4/A5.
- Preiskatalog im laufenden Test geprüft: Fotoimport, Speichern, Details, Duplizieren, Archivieren, Wiederherstellen und Suche.
- Signierte App direkt im PDF-Testmodus gestartet; acht lesbare A4-/A5-Dokumente erfolgreich erzeugt.
- Vollständige Ad-hoc-Signatur und DMG-Integrität geprüft; SHA-256 der direkt abgelegten Kopie stimmt mit dem versionierten Original überein.

Die App-Version bleibt 0.3.0; diese Änderung verbessert die Ablage und dokumentiert die erneute Prüfung. Die App ist weiterhin nicht mit einer Apple Developer ID signiert oder notarisiert.

## 0.3.0 - 21.10.2026

- Neuer Preiskatalog mit Produktgalerie, Suche sowie Kategorie-, Material- und Archivfiltern.
- Produkte mit CHF-Stückpreis, Ab-Preis, MWST-Angabe, Beschreibung, Material, Farbe und Abmessungen.
- Bis zu acht importierte Fotos je Produkt, Titelbildauswahl und Entfernen einzelner Fotos.
- Produkte bearbeiten, duplizieren, archivieren und wiederherstellen.
- Lokale, atomare Speicherung inklusive optimierter Bildkopien unter `Dokumente/3D Druck Angebote/Preiskatalog/katalog.json`.
- Katalogpreise werden manuell gepflegt; Angebotsübernahme und PDF-Katalogexport sind noch nicht enthalten.

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

# OpenAI API-Schlüssel einrichten

## Schritt 1: API-Schlüssel erhalten
1. Gehe zu [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Melde dich an oder erstelle ein Konto
3. Klicke auf "Create new secret key"
4. Kopiere den generierten API-Schlüssel

## Schritt 2: API-Schlüssel in der App konfigurieren
1. Öffne die Datei `config/api-keys.js`
2. Ersetze `'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'` mit deinem echten API-Schlüssel
3. Speichere die Datei

## Schritt 3: Server neu starten
```powershell
$env:NODE_ENV="development"; npx tsx server/index.ts
```

## Was die AI-Features bieten:
- ✅ Automatische Produktbeschreibungen aus CSV-Daten
- ✅ Bildanalyse für Screenshots und Produktfotos  
- ✅ PDF-Text-Extraktion und -Analyse
- ✅ Intelligente Produktnamen-Generierung
- ✅ HTML-Formatierung von Produktbeschreibungen

**Hinweis:** Ohne API-Schlüssel funktionieren alle anderen Features (CSV-Upload, Tabellen-Management, etc.) weiterhin normal - nur die AI-gestützten Features sind dann nicht verfügbar.

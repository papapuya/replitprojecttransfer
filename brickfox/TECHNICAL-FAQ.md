# Technische FAQ für IT-Abteilung

## 🏗️ Architektur & Technologie

### **Q: Welche Programmiersprachen werden verwendet?**
A: 
- **Frontend**: TypeScript + React
- **Backend**: TypeScript + Node.js
- **Datenbank**: SQL (SQLite/PostgreSQL)
- **Build**: JavaScript (Vite, tsx)

### **Q: Welche Frameworks und Bibliotheken werden genutzt?**
A:
- **Frontend**: React 18, Tailwind CSS, shadcn/ui, React Query
- **Backend**: Express.js, Prisma ORM, Multer (File Upload)
- **AI**: OpenAI SDK, Tesseract.js (OCR)
- **Scraping**: Firecrawl API, Cheerio (HTML Parser)

### **Q: Wie ist die App strukturiert?**
A:
```
CodeCSVUpload/
├── client/          # React Frontend
├── server/          # Node.js Backend
├── shared/          # Gemeinsame TypeScript Types
├── local.db         # SQLite Datenbank
└── package.json     # Dependencies
```

## 🔧 Entwicklung & Deployment

### **Q: Wie starte ich die App lokal?**
A:
```bash
npm install          # Dependencies installieren
npm run dev         # Development Server starten
# Frontend: http://localhost:3000
# Backend: http://localhost:5000
```

### **Q: Wie baue ich die App für Production?**
A:
```bash
npm run build       # Frontend Build
npm start          # Production Server
```

### **Q: Welche Umgebungsvariablen brauche ich?**
A:
```env
OPENAI_API_KEY=sk-...           # OpenAI API Key
FIRECRAWL_API_KEY=fc-...        # Firecrawl API Key
PORT=5000                       # Server Port
NODE_ENV=production             # Environment
```

## 🗄️ Datenbank & Storage

### **Q: Welche Datenbank wird verwendet?**
A: 
- **Development**: SQLite (lokale Datei)
- **Production**: PostgreSQL (empfohlen)
- **ORM**: Prisma für Type-safe Queries

### **Q: Wie funktioniert die Datenmigration?**
A:
```bash
npx prisma migrate dev    # Development Migration
npx prisma migrate deploy # Production Migration
npx prisma generate      # Client generieren
```

### **Q: Wo werden Upload-Dateien gespeichert?**
A: Temporär im `uploads/` Ordner, werden nach Verarbeitung gelöscht.

## 🔒 Sicherheit & API-Keys

### **Q: Wie werden API-Keys gespeichert?**
A: 
- Verschlüsselt mit AES-256
- Lokale Speicherung in `api-keys.json`
- Keine Hardcoded Keys im Code

### **Q: Wie verschlüssele ich neue API-Keys?**
A:
```bash
node encrypt-keys.js
# Eingabe: Plaintext API Key
# Ausgabe: Verschlüsselter Key für .env
```

### **Q: Welche Sicherheitsmaßnahmen gibt es?**
A:
- Input Validation (Zod Schemas)
- File Type Validation
- Rate Limiting
- CORS Protection
- SQL Injection Prevention (Prisma)

## 🌐 Netzwerk & APIs

### **Q: Welche externen APIs werden verwendet?**
A:
- **OpenAI API**: GPT-4o für Textgenerierung
- **Firecrawl API**: Web-Scraping
- **Tesseract.js**: Lokale OCR (kein API)

### **Q: Wie funktioniert das Web-Scraping?**
A:
1. **Primary**: Firecrawl API (professionell)
2. **Fallback**: Direkter Fetch mit User-Agent
3. **Fallback**: Googlebot User-Agent
4. **Error Handling**: Detaillierte Fehlermeldungen

### **Q: Welche Ports werden verwendet?**
A:
- **Frontend**: 3000 (Development)
- **Backend**: 5000 (Development/Production)
- **Database**: 5432 (PostgreSQL) oder lokale SQLite

## 📊 Performance & Monitoring

### **Q: Wie überwache ich die App-Performance?**
A:
- **Logs**: Strukturierte Logs mit Winston
- **Metrics**: Response Times, Error Rates
- **Database**: Query Performance mit Prisma
- **Memory**: Node.js Memory Usage

### **Q: Wie skaliere ich die App?**
A:
- **Horizontal**: Load Balancer + mehrere Instanzen
- **Vertical**: Mehr RAM/CPU für größere Dateien
- **Database**: PostgreSQL für mehr Concurrent Users
- **Caching**: Redis für häufige Queries

### **Q: Welche Performance-Limits gibt es?**
A:
- **File Size**: 50MB pro Upload
- **Concurrent Users**: 10-20 (SQLite), 100+ (PostgreSQL)
- **API Rate Limits**: OpenAI/Firecrawl Limits
- **Memory**: ~500MB pro Instanz

## 🔄 Integration & APIs

### **Q: Welche REST API Endpoints gibt es?**
A:
```
POST /api/analyze-files        # File Upload & Analysis
POST /api/scrape-url           # URL Scraping
POST /api/generate-description # AI Description Generation
GET  /api/projects             # Project Management
POST /api/projects             # Create Project
PUT  /api/projects/:id         # Update Project
DELETE /api/projects/:id       # Delete Project
```

### **Q: Wie integriere ich die App in bestehende Systeme?**
A:
- **REST API**: Standard HTTP Endpoints
- **Webhooks**: Für Event-basierte Integration
- **Export**: CSV/JSON für Shop-Systeme
- **Import**: CSV für Bulk-Operations

### **Q: Kann ich die App als Microservice verwenden?**
A: Ja, die App ist bereits als Microservice designed:
- Stateless Backend
- Externe Datenbank
- API-first Architecture
- Container-ready (Dockerfile vorhanden)

## 🐳 Container & Deployment

### **Q: Wie containerisiere ich die App?**
A:
```dockerfile
# Dockerfile ist vorhanden
docker build -t codecsvupload .
docker run -p 5000:5000 codecsvupload
```

### **Q: Welche Deployment-Optionen gibt es?**
A:
- **Docker**: Lokal oder auf Server
- **Kubernetes**: Für große Deployments
- **Cloud**: Railway, Render, Heroku
- **On-Premise**: Windows/Linux Server

### **Q: Wie konfiguriere ich die App für Production?**
A:
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
```

## 🔧 Wartung & Updates

### **Q: Wie aktualisiere ich die App?**
A:
```bash
git pull origin main           # Code Updates
npm install                   # Dependencies
npx prisma migrate deploy    # Database Updates
npm run build                # Frontend Build
pm2 restart all              # Server Restart
```

### **Q: Wie backup ich die Datenbank?**
A:
```bash
# SQLite
cp local.db backup-$(date +%Y%m%d).db

# PostgreSQL
pg_dump -h localhost -U user -d database > backup.sql
```

### **Q: Wie überwache ich die App-Logs?**
A:
```bash
# PM2 Logs
pm2 logs codecsvupload

# Docker Logs
docker logs -f codecsvupload

# File Logs
tail -f logs/app.log
```

## 🚨 Troubleshooting

### **Q: Die App startet nicht - was tun?**
A:
1. **Port bereits belegt**: `netstat -ano | findstr :5000`
2. **Dependencies fehlen**: `npm install`
3. **API Keys fehlen**: `.env` Datei prüfen
4. **Database Error**: `npx prisma migrate dev`

### **Q: Upload funktioniert nicht - was ist das Problem?**
A:
1. **File Size Limit**: Max 50MB
2. **File Type**: Nur PDF, CSV, PNG, JPG
3. **Disk Space**: Uploads Ordner prüfen
4. **Permissions**: Schreibrechte prüfen

### **Q: KI-Generierung funktioniert nicht - warum?**
A:
1. **API Key**: OpenAI Key prüfen
2. **Rate Limits**: OpenAI Limits erreicht
3. **Network**: Internetverbindung prüfen
4. **Content**: Zu wenig Produktdaten

## 📈 Monitoring & Alerting

### **Q: Wie setze ich Monitoring auf?**
A:
- **Uptime**: UptimeRobot oder Pingdom
- **Logs**: ELK Stack oder CloudWatch
- **Metrics**: Prometheus + Grafana
- **Alerts**: Slack/Email bei Fehlern

### **Q: Welche Metriken sollte ich überwachen?**
A:
- **Response Time**: < 2 Sekunden
- **Error Rate**: < 1%
- **Memory Usage**: < 80%
- **Disk Space**: < 80%
- **API Rate Limits**: OpenAI/Firecrawl

## 🔐 Security Best Practices

### **Q: Wie sichere ich die App ab?**
A:
- **HTTPS**: SSL/TLS Zertifikate
- **Firewall**: Nur notwendige Ports öffnen
- **Updates**: Regelmäßige Security Updates
- **Backups**: Automatische Datensicherung
- **Monitoring**: Security Event Logging

### **Q: Wie teste ich die App-Sicherheit?**
A:
- **Penetration Testing**: OWASP ZAP
- **Dependency Scanning**: `npm audit`
- **Code Analysis**: SonarQube
- **Security Headers**: Helmet.js

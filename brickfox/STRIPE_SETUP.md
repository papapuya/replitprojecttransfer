# Stripe Setup-Anleitung für PIMPilot SaaS

## 1. Stripe Account erstellen
1. Gehen Sie zu https://dashboard.stripe.com/register
2. Erstellen Sie einen neuen Account
3. Verifizieren Sie Ihre E-Mail

## 2. Produkte und Preise erstellen

### Im Stripe Dashboard (https://dashboard.stripe.com/test/products):

#### Starter Plan
1. Klicken Sie auf **"Create product"**
2. Name: `PIMPilot Starter`
3. Pricing model: **Recurring**
4. Price: **€29.00 EUR**
5. Billing period: **Monthly**
6. Klicken Sie auf **"Save product"**
7. **Kopieren Sie die Price ID** (beginnt mit `price_...`)
8. Speichern Sie sie als: `STRIPE_PRICE_STARTER`

#### Pro Plan
1. Klicken Sie auf **"Create product"**
2. Name: `PIMPilot Pro`
3. Pricing model: **Recurring**
4. Price: **€79.00 EUR**
5. Billing period: **Monthly**
6. Klicken Sie auf **"Save product"**
7. **Kopieren Sie die Price ID** (beginnt mit `price_...`)
8. Speichern Sie sie als: `STRIPE_PRICE_PRO`

#### Enterprise Plan
1. Klicken Sie auf **"Create product"**
2. Name: `PIMPilot Enterprise`
3. Pricing model: **Recurring**
4. Price: **€199.00 EUR**
5. Billing period: **Monthly**
6. Klicken Sie auf **"Save product"**
7. **Kopieren Sie die Price ID** (beginnt mit `price_...`)
8. Speichern Sie sie als: `STRIPE_PRICE_ENTERPRISE`

## 3. API-Schlüssel kopieren

### Im Stripe Dashboard (https://dashboard.stripe.com/test/apikeys):

#### Secret Key
1. Klicken Sie auf **"Reveal test key"** bei **"Secret key"**
2. Kopieren Sie den Schlüssel (beginnt mit `sk_test_...`)
3. Speichern Sie ihn als: `STRIPE_SECRET_KEY`

#### Publishable Key
1. Kopieren Sie den **"Publishable key"** (beginnt mit `pk_test_...`)
2. Speichern Sie ihn als: `VITE_STRIPE_PUBLIC_KEY`

## 4. Webhook einrichten

### Im Stripe Dashboard (https://dashboard.stripe.com/test/webhooks):

1. Klicken Sie auf **"Add endpoint"**
2. Endpoint URL: `https://ihr-repl-name.replit.app/api/stripe/webhook`
   - Ersetzen Sie `ihr-repl-name` mit Ihrer Replit-Domain
3. **Events auswählen:**
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
4. Klicken Sie auf **"Add endpoint"**
5. **Kopieren Sie den Webhook Signing Secret** (beginnt mit `whsec_...`)
6. Speichern Sie ihn als: `STRIPE_WEBHOOK_SECRET`

## 5. Environment-Variablen setzen

Fügen Sie die folgenden Variablen zu Ihrer `.env`-Datei hinzu:

```env
# Stripe API Keys (Backend)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# Stripe Public Key (Frontend)
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

## 6. Testing

### Test-Kreditkarten (Stripe Test Mode):
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **Expiry:** Beliebiges zukünftiges Datum (z.B. 12/34)
- **CVC:** Beliebige 3 Ziffern (z.B. 123)

### Test-Flow:
1. Registrieren Sie einen neuen Test-User
2. Wählen Sie einen Plan auf `/pricing`
3. Verwenden Sie Testkarte `4242 4242 4242 4242`
4. Überprüfen Sie die Subscription im Account
5. Testen Sie AI-Generierung (sollte API-Calls zählen)
6. Überprüfen Sie Usage-Meter im Account

## 7. Production Setup

⚠️ **Wichtig:** Für Production verwenden Sie **LIVE** Keys statt Test Keys!

### Im Stripe Dashboard umschalten:
1. Klicken Sie auf **"Test mode"** Toggle oben rechts
2. Schalten Sie um auf **Live mode**
3. Wiederholen Sie die Schritte 2-4 mit **Live** Keys
4. Ersetzen Sie alle `sk_test_...` / `pk_test_...` durch `sk_live_...` / `pk_live_...`

## 8. Troubleshooting

### Webhook funktioniert nicht:
- ✅ Überprüfen Sie, ob `STRIPE_WEBHOOK_SECRET` korrekt ist
- ✅ Testen Sie mit **Stripe CLI**: `stripe listen --forward-to localhost:5000/api/stripe/webhook`
- ✅ Logs prüfen: `/tmp/logs/App_*.log`

### Checkout schlägt fehl:
- ✅ Überprüfen Sie `STRIPE_PRICE_STARTER/PRO/ENTERPRISE` IDs
- ✅ Stellen Sie sicher, dass User eingeloggt ist
- ✅ Browser Console für Fehler prüfen

### Subscription Status wird nicht aktualisiert:
- ✅ Webhook-Events in Stripe Dashboard prüfen
- ✅ Server-Logs für Fehler checken
- ✅ Datenbank überprüfen: `SELECT * FROM users WHERE email = 'test@example.com';`

## Support

Bei Problemen:
1. Stripe Dashboard → Logs → Webhook attempts
2. Server Logs: `/tmp/logs/App_*.log`
3. Browser Console (F12)

# CSV Upload App - Render Deployment

## Deploy to Render

### 1. Fork this repository
Fork this repository to your GitHub account.

### 2. Create a new Web Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select this repository

### 3. Configure the service
- **Name**: csv-upload-app (or your preferred name)
- **Environment**: Node
- **Plan**: Free
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### 4. Environment Variables
Add these environment variables in Render dashboard:

- `NODE_ENV`: `production`
- `DATABASE_URL`: Will be provided by Render PostgreSQL database
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Your OpenAI API key
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: `https://api.openai.com/v1`

### 5. Create PostgreSQL Database
1. In Render dashboard, click "New +" → "PostgreSQL"
2. Name it: `csv-upload-db`
3. Plan: Free
4. Copy the connection string to `DATABASE_URL` environment variable

### 6. Deploy
Click "Create Web Service" and wait for deployment to complete.

## Features
- ✅ CSV file upload and analysis
- ✅ AI-powered product description generation
- ✅ Custom attributes management
- ✅ Project management
- ✅ Clean data extraction (no ** formatting, no units)

## Local Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
npm start
```

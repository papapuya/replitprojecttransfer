import fs from 'fs';
import path from 'path';

const CREDENTIALS_FILE = path.join(process.cwd(), 'credentials.json');

interface Credentials {
  openaiApiKey: string;
  firecrawlApiKey: string;
}

// Load credentials from file
export function loadCredentials(): Credentials {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const data = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
      const credentials = JSON.parse(data);
      
      // Set environment variables
      if (credentials.openaiApiKey) {
        process.env.OPENAI_API_KEY = credentials.openaiApiKey;
      }
      if (credentials.firecrawlApiKey) {
        process.env.FIRECRAWL_API_KEY = credentials.firecrawlApiKey;
      }
      
      console.log('✅ Credentials loaded from file');
      return credentials;
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }
  
  return { openaiApiKey: '', firecrawlApiKey: '' };
}

// Save credentials to file
export function saveCredentials(credentials: Credentials): void {
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
    
    // Set environment variables
    if (credentials.openaiApiKey) {
      process.env.OPENAI_API_KEY = credentials.openaiApiKey;
    }
    if (credentials.firecrawlApiKey) {
      process.env.FIRECRAWL_API_KEY = credentials.firecrawlApiKey;
    }
    
    console.log('✅ Credentials saved to file');
  } catch (error) {
    console.error('Error saving credentials:', error);
  }
}

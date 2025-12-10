import { encryptionService } from './services/encryption-service';

interface SecureApiKeys {
  openai?: string;
  firecrawl?: string;
}

class ApiKeyManager {
  private encryptedKeys: SecureApiKeys = {};
  
  setApiKey(service: keyof SecureApiKeys, apiKey: string): void {
    const encrypted = encryptionService.encrypt(apiKey);
    if (encrypted) {
      this.encryptedKeys[service] = encrypted;
      console.log(`API-Schlüssel für ${service} verschlüsselt gespeichert`);
    }
  }
  
  getApiKey(service: keyof SecureApiKeys): string | null {
    const encryptedKey = this.encryptedKeys[service];
    if (!encryptedKey) {
      return null;
    }
    
    try {
      return encryptionService.decrypt(encryptedKey);
    } catch (error) {
      console.error(`Fehler beim Entschlüsseln des ${service} API-Schlüssels:`, error);
      return null;
    }
  }
  
  loadFromEnvironment(): void {
    const encryptedOpenAI = process.env.ENCRYPTED_OPENAI_API_KEY;
    const encryptedFirecrawl = process.env.ENCRYPTED_FIRECRAWL_API_KEY;
    
    if (encryptedOpenAI) {
      try {
        this.encryptedKeys.openai = encryptedOpenAI;
        console.log('OpenAI API-Schlüssel aus verschlüsselter Umgebungsvariable geladen');
      } catch (error) {
        console.error('Fehler beim Laden des verschlüsselten OpenAI API-Schlüssels:', error);
      }
    }
    
    if (encryptedFirecrawl) {
      try {
        this.encryptedKeys.firecrawl = encryptedFirecrawl;
        console.log('Firecrawl API-Schlüssel aus verschlüsselter Umgebungsvariable geladen');
      } catch (error) {
        console.error('Fehler beim Laden des verschlüsselten Firecrawl API-Schlüssels:', error);
      }
    }
  }
  
  clearAllKeys(): void {
    this.encryptedKeys = {};
    console.log('Alle API-Schlüssel gelöscht');
  }
}

export const apiKeyManager = new ApiKeyManager();

export function getSecureOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY || apiKeyManager.getApiKey('openai') || null;
}

export function getSecureFirecrawlKey(): string | null {
  return apiKeyManager.getApiKey('firecrawl') || process.env.FIRECRAWL_API_KEY || null;
}

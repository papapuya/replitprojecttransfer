import crypto from 'crypto';

// SECURITY: Use proper 32-byte key from environment, hashed for consistent length
const ENCRYPTION_KEY_STR = process.env.ENCRYPTION_KEY || 'your-32-character-secret-key-here!';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_STR).digest();
const ALGORITHM = 'aes-256-cbc';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const textParts = encryptedText.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedData = textParts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Hilfsfunktion zum Verschlüsseln von API-Schlüsseln
export function encryptApiKey(apiKey: string): string {
  return encrypt(apiKey);
}

// Hilfsfunktion zum Entschlüsseln von API-Schlüsseln
export function decryptApiKey(encryptedApiKey: string): string {
  return decrypt(encryptedApiKey);
}

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

class EncryptionService {
  private masterKey: Buffer | null = null;

  private getEncryptionKey(): Buffer {
    if (this.masterKey) {
      return this.masterKey;
    }

    const key = process.env.ENCRYPTION_KEY;
    
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }

    if (key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }

    this.masterKey = crypto.createHash('sha256').update(key).digest();
    return this.masterKey;
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === '') {
      return null;
    }

    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      const result = Buffer.concat([
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);

      return result.toString('base64');
    } catch (error) {
      console.error('[Encryption] Error encrypting data:', error);
      throw new Error('Encryption failed');
    }
  }

  decrypt(ciphertext: string | null | undefined): string | null {
    if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
      return null;
    }

    try {
      const key = this.getEncryptionKey();
      const buffer = Buffer.from(ciphertext, 'base64');
      
      const iv = buffer.subarray(0, IV_LENGTH);
      const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('[Encryption] Decryption failed - possible tampering or wrong key:', error);
      throw new Error('Decryption failed - data may be tampered or encryption key is wrong');
    }
  }

  encryptObject<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };
    
    for (const field of fields) {
      const value = obj[field];
      if (typeof value === 'string') {
        result[field] = this.encrypt(value) as any;
      }
    }
    
    return result;
  }

  decryptObject<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };
    
    for (const field of fields) {
      const value = obj[field];
      if (typeof value === 'string') {
        result[field] = this.decrypt(value) as any;
      }
    }
    
    return result;
  }

  hashPassword(password: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
    
    return Buffer.concat([salt, hash]).toString('base64');
  }

  verifyPassword(password: string, hashedPassword: string): boolean {
    try {
      const buffer = Buffer.from(hashedPassword, 'base64');
      const salt = buffer.subarray(0, SALT_LENGTH);
      const originalHash = buffer.subarray(SALT_LENGTH);
      
      const hash = crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
      
      return crypto.timingSafeEqual(hash, originalHash);
    } catch (error) {
      console.error('[Encryption] Error verifying password:', error);
      return false;
    }
  }
}

export const encryptionService = new EncryptionService();

/**
 * Web Crypto API utilities for end-to-end encryption using AES-GCM.
 */

async function getCryptoKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  // Hash the password with SHA-256 to ensure a standard 256-bit key length
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return await window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(
  text: string,
  passwordKey: string
): Promise<{ ciphertext: string; iv: string }> {
  try {
    const key = await getCryptoKey(passwordKey);
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    
    // Generate a secure random 12-byte initialization vector (IV)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedText
    );
    
    // Convert to base64 for safe transport and storage
    const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    const ivBase64 = btoa(String.fromCharCode(...iv));
    
    return { ciphertext: ciphertextBase64, iv: ivBase64 };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Mesaj şifrelenirken hata oluştu.');
  }
}

export async function decryptMessage(
  ciphertext: string,
  iv: string,
  passwordKey: string
): Promise<string> {
  try {
    const key = await getCryptoKey(passwordKey);
    
    // Convert base64 back to Uint8Arrays
    const ivBytes = new Uint8Array(
      atob(iv)
        .split('')
        .map((c) => c.charCodeAt(0))
    );
    const ciphertextBytes = new Uint8Array(
      atob(ciphertext)
        .split('')
        .map((c) => c.charCodeAt(0))
    );
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      ciphertextBytes
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.warn('Decryption failed. Incorrect key or corrupt message payload.', error);
    return '[Deşifre Edilemedi - Yanlış Şifre Anahtarı]';
  }
}

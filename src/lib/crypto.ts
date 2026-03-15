
// Web Crypto API utility for encrypting and decrypting data

// Convert string to buffer
const str2ab = (str: string) => {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

// Convert buffer to base64 string
const ab2str = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  const len = bytes.byteLength;
  // Handle large buffers in chunks to avoid call stack overflow
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return binary;
};

// Magic string for empty password to avoid empty key material issues in some Web Crypto implementations
const EMPTY_PASSWORD_FALLBACK = "xDB_DEFAULT_EMPTY_PASSWORD_KEY_MATERIAL_v1";

const getPasswordKey = (password: string) => {
  const passwordMaterial = password === "" ? EMPTY_PASSWORD_FALLBACK : password;
  return window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passwordMaterial),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
};

const deriveKey = (passwordKey: CryptoKey, salt: Uint8Array, keyUsage: ["encrypt"] | ["decrypt"]) =>
  window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsage
  );

export interface EncryptedData {
  salt: string; // Base64
  iv: string;   // Base64
  data: string; // Base64
  version: number;
}

export async function encryptData(data: string, password: string): Promise<EncryptedData> {
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
    
    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
      },
      aesKey,
      new TextEncoder().encode(data)
    );

    return {
      salt: btoa(ab2str(salt)),
      iv: btoa(ab2str(iv)),
      data: btoa(ab2str(encryptedContent)),
      version: 1
    };
  } catch (err) {
    console.error("Encryption process failed:", err);
    throw err;
  }
}

export async function decryptData(encryptedData: EncryptedData, password: string): Promise<string> {
  try {
    const salt = new Uint8Array(str2ab(atob(encryptedData.salt)));
    const iv = new Uint8Array(str2ab(atob(encryptedData.iv)));
    const data = new Uint8Array(str2ab(atob(encryptedData.data)));

    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);

    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
      },
      aesKey,
      data as BufferSource
    );

    return new TextDecoder().decode(decryptedContent);
  } catch (err) {
    console.error("Decryption failed:", err);
    throw new Error("Decryption failed");
  }
}

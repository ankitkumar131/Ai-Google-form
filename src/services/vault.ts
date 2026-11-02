// This module is bundled ONLY into the trusted background worker.
export interface EncryptedVault {
  salt: number[];
  iv: number[];
  data: number[];
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
async function derive(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}
async function sessionKey(): Promise<CryptoKey> {
  const { vaultKey } = await chrome.storage.session.get('vaultKey');
  if (!vaultKey) throw new Error('Unlock your API key vault in settings first.');
  return crypto.subtle.importKey('jwk', vaultKey, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}
async function decrypt(key: CryptoKey, vault: EncryptedVault): Promise<Record<string, string>> {
  return JSON.parse(
    decoder.decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(vault.iv) },
        key,
        new Uint8Array(vault.data),
      ),
    ),
  );
}
export async function unlockVault(passphrase: string) {
  if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
  const { vault } = (await chrome.storage.local.get('vault')) as { vault?: EncryptedVault };
  const salt = vault ? new Uint8Array(vault.salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(passphrase, salt);
  if (vault) {
    try {
      await decrypt(key, vault);
    } catch {
      throw new Error('Incorrect passphrase or damaged vault.');
    }
  } else {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode('{}'));
    await chrome.storage.local.set({
      vault: { salt: [...salt], iv: [...iv], data: [...new Uint8Array(data)] },
    });
  }
  await chrome.storage.session.set({ vaultKey: await crypto.subtle.exportKey('jwk', key) });
}
export async function getKeys(): Promise<Record<string, string>> {
  const { vault } = await chrome.storage.local.get('vault');
  if (!vault) return {};
  return decrypt(await sessionKey(), vault);
}
export async function prepareKeyUpdate(id: string, value: string): Promise<EncryptedVault> {
  const key = await sessionKey();
  const { vault } = await chrome.storage.local.get('vault');
  const keys = await decrypt(key, vault);
  if (value.trim()) keys[id] = value.trim();
  else delete keys[id];
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(keys)),
  );
  return { salt: vault.salt, iv: [...iv], data: [...new Uint8Array(data)] };
}
export async function setKey(id: string, value: string) {
  await chrome.storage.local.set({ vault: await prepareKeyUpdate(id, value) });
}
export async function lockVault() {
  await chrome.storage.session.remove('vaultKey');
}

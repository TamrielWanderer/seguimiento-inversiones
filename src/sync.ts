// Pasar la cartera a otro dispositivo con un QR cifrado.
// El contenido se comprime y se cifra con AES-GCM; la clave sale de un código corto (PBKDF2).
// Nada pasa por un servidor: el QR lleva los datos y el código se escribe a mano en el otro dispositivo.

export const SYNC_PREFIX = "SQ1.";
const ITERATIONS = 200_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I, para dictarlo sin errores

const b64u = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(data: Uint8Array, stream: unknown): Promise<Uint8Array> {
  const out = (new Blob([data as BlobPart]).stream() as unknown as { pipeThrough: (x: unknown) => ReadableStream }).pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Lo que escribe la persona: sin guiones ni espacios, en mayúsculas. */
export const normalizeKey = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Código de 8 caracteres (40 bits al azar), mostrado como XXXX-XXXX. */
export function newSyncKey(): string {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((b) => ALPHABET[b % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

async function deriveKey(key: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizeKey(key)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export const syncAvailable = (): boolean =>
  typeof crypto !== "undefined" && !!crypto.subtle && typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

/** Comprime y cifra. Devuelve "SQ1." + base64url(sal 16 | iv 12 | cifrado). */
export async function packSync(data: unknown, key: string): Promise<string> {
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream("deflate-raw"));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await deriveKey(key, salt), plain as BufferSource));
  const all = new Uint8Array(28 + enc.length);
  all.set(salt, 0); all.set(iv, 16); all.set(enc, 28);
  return SYNC_PREFIX + b64u(all);
}

/** Descifra. Tira un error si el código no es el correcto o el contenido está dañado. */
export async function unpackSync(packed: string, key: string): Promise<unknown> {
  const all = unb64u(packed.slice(SYNC_PREFIX.length));
  if (all.length < 45) throw new Error("corto");
  const dec = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(16, 28) as BufferSource }, await deriveKey(key, all.slice(0, 16)), all.slice(28) as BufferSource));
  return JSON.parse(new TextDecoder().decode(await pipe(dec, new DecompressionStream("deflate-raw"))));
}

/** Encuentra el contenido cifrado en un texto pegado o en la dirección que abre el QR. */
export function findSync(text: string): string | null {
  const m = text.match(/SQ1\.[A-Za-z0-9_-]{60,}/);
  return m ? m[0] : null;
}

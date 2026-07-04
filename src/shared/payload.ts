export interface FormattedPayload {
  bytes: Uint8Array;
  text: string;
  json: string | null;
  hex: string;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    return Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

export function formatPayload(payloadBase64: string): FormattedPayload {
  const bytes = decodeBase64(payloadBase64);
  const text = new TextDecoder().decode(bytes);
  let json: string | null = null;

  try {
    json = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    json = null;
  }

  return {
    bytes,
    text,
    json,
    hex: [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
  };
}

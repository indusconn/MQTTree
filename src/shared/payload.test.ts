import { describe, expect, it } from 'vitest';
import { formatPayload } from './payload';

describe('formatPayload', () => {
  it('formats valid JSON while preserving text and hexadecimal views', () => {
    const result = formatPayload(Buffer.from('{"value":23.8}').toString('base64'));

    expect(result.text).toBe('{"value":23.8}');
    expect(result.json).toBe('{\n  "value": 23.8\n}');
    expect(result.hex).toBe('7b 22 76 61 6c 75 65 22 3a 32 33 2e 38 7d');
  });

  it('marks binary data as non-JSON without throwing', () => {
    const result = formatPayload(Buffer.from([0xff, 0x00]).toString('base64'));

    expect(result.json).toBeNull();
    expect(result.hex).toBe('ff 00');
  });
});

import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from '../../src/auth/pin';

describe('pin hashing', () => {
  it('hashes and verifies a correct pin', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('rejects an incorrect pin', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('9999', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('1234', b)).toBe(true);
  });
});

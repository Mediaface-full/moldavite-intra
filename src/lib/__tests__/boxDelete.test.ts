import { describe, it, expect } from 'vitest';
import { decideBoxDelete } from '@/lib/boxDelete';

describe('decideBoxDelete', () => {
  it('prázdná kazeta → ok bez ohledu na withItems', () => {
    expect(decideBoxDelete({ itemCount: 0, soldCount: 0, withItems: false })).toEqual({ ok: true });
    expect(decideBoxDelete({ itemCount: 0, soldCount: 0, withItems: true })).toEqual({ ok: true });
  });

  it('kameny bez withItems → 409 s počtem', () => {
    const d = decideBoxDelete({ itemCount: 3, soldCount: 0, withItems: false });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(409);
      expect(d.error).toContain('3 kameny');
      expect(d.error).toContain('withItems');
    }
  });

  it('kameny s withItems a nic prodaného → ok', () => {
    expect(decideBoxDelete({ itemCount: 7, soldCount: 0, withItems: true })).toEqual({ ok: true });
  });

  it('prodaný kámen → 409 i s withItems (audit prodeje)', () => {
    const d = decideBoxDelete({ itemCount: 7, soldCount: 1, withItems: true });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.error).toContain('1 prodaný kámen');
      expect(d.error).toContain('auditem prodeje');
    }
    const d5 = decideBoxDelete({ itemCount: 7, soldCount: 5, withItems: true });
    expect(d5.ok).toBe(false);
    if (!d5.ok) expect(d5.error).toContain('5 prodaných kamenů');
  });

  it('prodaný kámen má přednost před chybějícím withItems', () => {
    const d = decideBoxDelete({ itemCount: 2, soldCount: 2, withItems: false });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toContain('prodané kameny');
  });
});

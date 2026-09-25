// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ID, readReturn, savePending, squareUrl, takePending } from './square';

const SALE = { student: 2, other: 1, priceStudent: 8, priceOther: 23 };
const ID = 'sq0idp-AbCdEfGhIjKlMn';

afterEach(() => localStorage.clear());

describe('Square Point of Sale (web mobile)', () => {
  it('iOS : montant en cents CAD, adresse de retour et Application ID', () => {
    const url = squareUrl(ID, SALE, false);
    expect(url.startsWith('square-commerce-v1://payment/create?data=')).toBe(true);
    const data = JSON.parse(decodeURIComponent(url.split('data=')[1]));
    expect(data.amount_money).toEqual({ amount: '3900', currency_code: 'CAD' });
    expect(data.client_id).toBe(ID);
    expect(data.callback_url).toBe(`${window.location.origin}/`);
  });

  it('Android : intent avec montant, devise et retour', () => {
    const url = squareUrl(ID, SALE, true);
    expect(url).toMatch(/^intent:#Intent;action=com\.squareup\.pos\.action\.CHARGE;package=com\.squareup;/);
    expect(url).toContain('i.com.squareup.pos.TOTAL_AMOUNT=3900;');
    expect(url).toContain('S.com.squareup.pos.CURRENCY_CODE=CAD;');
    expect(url).toContain(`S.com.squareup.pos.CLIENT_ID=${ID};`);
    expect(url.endsWith(';end')).toBe(true);
  });

  it('lit le retour : succès, erreur, ou aucun retour', () => {
    expect(readReturn('?com.squareup.pos.SERVER_TRANSACTION_ID=t1')).toEqual({ ok: true });
    expect(readReturn('?com.squareup.pos.ERROR_CODE=com.squareup.pos.ERROR_TRANSACTION_CANCELED')).toEqual({
      ok: false, error: 'com.squareup.pos.ERROR_TRANSACTION_CANCELED',
    });
    expect(readReturn(`?data=${encodeURIComponent(JSON.stringify({ transaction_id: 't2' }))}`)).toEqual({ ok: true });
    expect(readReturn(`?data=${encodeURIComponent(JSON.stringify({ error_code: 'payment_canceled' }))}`)).toEqual({
      ok: false, error: 'payment_canceled',
    });
    expect(readReturn('')).toBeNull();
  });

  it('la vente en attente ne se lit qu’une fois', () => {
    savePending(SALE);
    expect(takePending()).toEqual(SALE);
    expect(takePending()).toBeNull();
  });

  it('format de l’Application ID', () => {
    expect(APP_ID.test(ID)).toBe(true);
    expect(APP_ID.test('https://evil.example')).toBe(false);
  });
});

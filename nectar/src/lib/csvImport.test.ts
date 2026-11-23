import { describe, expect, it } from 'vitest';
import { guessCategory, parseBankStatement, parseCsvRows, parseStatementAmount, parseStatementDate } from './csvImport';
import type { Tx } from './finance';

const existing = (over: Partial<Tx>): Tx => ({
  id: 'e1', description: 'Lidl Supermercado', type: 'expense', amount: 279, date: '2026-11-12',
  category: 'Mercado', payment_method: 'debito', bank_id: 'b1', card_id: null, is_pending: false,
  installment_purchase_id: null, installment_number: null, recurring_template_id: null,
  currency: 'EUR', original_amount: 45, fx_rate: 6.2, ...over,
});

describe('CSV primitives', () => {
  it('parses quoted fields and auto-detects semicolon vs comma', () => {
    expect(parseCsvRows('Data;Descrição;Valor\n12/11/2026;"Mercado, Centro";-120,50')).toEqual({
      delimiter: ';',
      rows: [['Data', 'Descrição', 'Valor'], ['12/11/2026', 'Mercado, Centro', '-120,50']],
    });
  });

  it('parses ISO, BR and hyphenated dates and US/BR amounts', () => {
    expect(parseStatementDate('2026-11-12 14:30:00')).toBe('2026-11-12');
    expect(parseStatementDate('12/11/2026')).toBe('2026-11-12');
    expect(parseStatementDate('12-11-2026')).toBe('2026-11-12');
    expect(parseStatementAmount('-1.234,56')).toBe(-1234.56);
    expect(parseStatementAmount('-45.90')).toBe(-45.9);
    expect(parseStatementAmount('R$ 250,00')).toBe(250);
  });

  it('suggests categories from merchant names', () => {
    expect(guessCategory('Lidl Lisboa', 'expense')).toBe('Mercado');
    expect(guessCategory('Uber Trip', 'expense')).toBe('Transporte');
    expect(guessCategory('Spotify Premium', 'expense')).toBe('Assinaturas');
    expect(guessCategory('Salário Mensal', 'income')).toBe('Salário');
  });
});

describe('parseBankStatement', () => {
  it('detects Revolut CSV, skips REVERTED rows, preserves EUR and flags duplicates', () => {
    const csv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'CARD_PAYMENT,Current,2026-11-12 10:15:00,2026-11-12 10:16:00,Lidl Supermercado,-45.00,0.00,EUR,COMPLETED,1150.00',
      'CARD_PAYMENT,Current,2026-11-13 08:00:00,2026-11-13 08:05:00,Bolt Ride,-12.50,0.00,EUR,COMPLETED,1137.50',
      'CARD_PAYMENT,Current,2026-11-13 09:00:00,,Failed Shop,-99.00,0.00,EUR,REVERTED,1137.50',
      'TOPUP,Current,2026-11-14 12:00:00,2026-11-14 12:00:00,Refund Amazon,30.00,0.00,EUR,COMPLETED,1167.50',
    ].join('\n');

    const res = parseBankStatement(csv, [existing({})]);
    expect(res.format).toBe('revolut');
    expect(res.skippedCount).toBe(1);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ date: '2026-11-12', amount: 45, currency: 'EUR', type: 'expense', category: 'Mercado', duplicate: true });
    expect(res.rows[1]).toMatchObject({ date: '2026-11-13', amount: 12.5, currency: 'EUR', type: 'expense', category: 'Transporte', duplicate: false });
    expect(res.rows[2]).toMatchObject({ date: '2026-11-14', amount: 30, currency: 'EUR', type: 'income', category: 'Reembolso', duplicate: false });
  });

  it('detects Nubank BR CSV with DD/MM/YYYY dates and BRL defaults', () => {
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '10/11/2026,-89.90,abc123,iFood *Restaurante',
      '15/11/2026,3500.00,abc124,Transferência recebida - Salário',
    ].join('\n');

    const res = parseBankStatement(csv, []);
    expect(res.format).toBe('nubank');
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ date: '2026-11-10', amount: 89.9, currency: 'BRL', type: 'expense', category: 'Alimentação' });
    expect(res.rows[1]).toMatchObject({ date: '2026-11-15', amount: 3500, currency: 'BRL', type: 'income', category: 'Salário' });
  });

  it('detects Wise CSV with DD-MM-YYYY dates and USD currency', () => {
    const csv = [
      'TransferWise ID,Date,Amount,Currency,Description',
      'CARD-1,18-11-2026,-20.00,USD,OpenAI ChatGPT',
    ].join('\n');

    const res = parseBankStatement(csv, []);
    expect(res.format).toBe('wise');
    expect(res.rows[0]).toMatchObject({ date: '2026-11-18', amount: 20, currency: 'USD', type: 'expense', category: 'Assinaturas' });
  });
});

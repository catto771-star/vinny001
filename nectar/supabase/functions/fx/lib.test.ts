import { describe, expect, it } from 'vitest';
import { addDays, bcbUrl, parseBcb, parseFrankfurter } from './lib';

describe('exchange rate sources', () => {
  it('reads a past day and derives the dollar from the euro', () => {
    expect(parseFrankfurter({ amount: 1, base: 'EUR', date: '2026-11-13', rates: { BRL: 6.2, USD: 1.16 } }))
      .toEqual({ rates: { USD: 5.3448, EUR: 6.2 }, date: '2026-11-13' });
    expect(parseFrankfurter({ message: 'not found' })).toBeNull();
  });
});

describe('Banco Central do Brasil (PTAX)', () => {
  it('takes the latest bulletin of the day, at the selling rate', () => {
    const day = { value: [
      { cotacaoCompra: 5.40, cotacaoVenda: 5.4012, dataHoraCotacao: '2026-11-19 10:09:27.123', tipoBoletim: 'Abertura' },
      { cotacaoCompra: 5.42, cotacaoVenda: 5.4256, dataHoraCotacao: '2026-11-19 13:05:11.456', tipoBoletim: 'Fechamento PTAX' },
      { cotacaoCompra: 5.41, cotacaoVenda: 5.4133, dataHoraCotacao: '2026-11-19 11:04:00.000', tipoBoletim: 'Intermediário' },
    ] };
    expect(parseBcb(day)).toEqual({ rate: 5.4256, at: '2026-11-19 13:05', bulletin: 'Fechamento PTAX' });
  });
  it('has nothing on weekends and holidays', () => {
    expect(parseBcb({ value: [] })).toBeNull();
    expect(parseBcb(null)).toBeNull();
  });
  it('asks for the date as the API wants it', () => {
    expect(bcbUrl('EUR', '2026-11-19')).toBe(
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='EUR'&@dataCotacao='11-19-2026'&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao,tipoBoletim");
  });
});

describe('days', () => {
  it('steps back across months', () => {
    expect(addDays('2026-12-01', -1)).toBe('2026-11-30');
  });
});

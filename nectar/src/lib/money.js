// Currencies. Every amount is kept in reais (BRL), so all totals and charts
// add up the same way; a transaction made in dollars or euros also keeps its
// original amount and the rate used. Screens can show values in another
// currency, converted at today's rate.
export const CURRENCIES = [
    { code: 'BRL', symbol: 'R$', name: 'Real' },
    { code: 'USD', symbol: 'US$', name: 'Dólar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
];
export const symbolOf = (c) => CURRENCIES.find((x) => x.code === c).symbol;
/** An amount in a currency formatted as people read it in Brazil: 'US$ 1.234,50'. */
export function formatIn(n, currency) {
    if (n === null || n === undefined || !Number.isFinite(n))
        return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n).replace(/ /g, ' ');
}
/** The amount in reais of a foreign amount at a rate (reais per unit), to the cent. */
export function toBRL(original, rate) {
    return Math.round(original * rate * 100) / 100;
}
/** An amount in reais shown in another currency at a rate (reais per unit). */
export function fromBRL(reais, rate) {
    return Math.round((reais / rate) * 100) / 100;
}
// The currency the money screens show, with today's rate. Set by the finance
// page; formatting reads it, so every screen converts the same way.
let display = { currency: 'BRL', rate: 1 };
export function setDisplay(currency, rate) {
    display = currency === 'BRL' || !rate ? { currency: 'BRL', rate: 1 } : { currency, rate };
}
export const displayCurrency = () => display.currency;
/** A value in reais, converted to the display currency. */
export const conv = (reais) => (display.currency === 'BRL' ? reais : fromBRL(reais, display.rate));
/** A value in reais, formatted in the display currency. */
export const money = (reais) => reais === null || reais === undefined || !Number.isFinite(reais) ? '—' : formatIn(conv(reais), display.currency);

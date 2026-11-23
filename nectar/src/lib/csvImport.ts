import type { Day } from './dates';
import type { Tx, TxType } from './finance';
import type { Currency } from './money';
import { searchKey } from './text';

export type BankCsvFormat = 'revolut' | 'wise' | 'nubank' | 'generic';

export interface ParsedCsvRow {
  rowIndex: number;
  date: Day;
  description: string;
  type: TxType;
  /** Positive magnitude in `currency`. */
  amount: number;
  currency: Currency;
  category: string;
  duplicate: boolean;
}

export interface CsvParseResult {
  format: BankCsvFormat;
  rows: ParsedCsvRow[];
  skippedCount: number;
  warnings: string[];
}

/** Splits CSV text into rows and columns respecting quoted fields and escaped quotes. */
export function parseCsvRows(raw: string): { delimiter: ',' | ';'; rows: string[][] } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { delimiter: ',', rows: [] };

  const firstLine = text.split('\n')[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const delimiter: ',' | ';' = semis > commas ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return { delimiter, rows };
}

/** Parses dates in YYYY-MM-DD[ HH:MM:SS], DD/MM/YYYY, or DD-MM-YYYY formats. */
export function parseStatementDate(raw: string): Day | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

/** Parses a signed monetary amount supporting both US (1,234.56) and BR/EU (1.234,56) formats. */
export function parseStatementAmount(raw: string): number | null {
  let s = raw.trim().replace(/[R$€£\s]/g, '').replace(/^US\$/, '');
  if (!s) return null;
  const neg = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[()+-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Decimal comma: 1.234,56 -> 1234.56
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Decimal dot: 1,234.56 -> 1234.56
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function normalizeCurrency(raw: string | undefined, fallback: Currency): Currency {
  const u = (raw ?? '').trim().toUpperCase();
  if (u === 'EUR' || u === '€') return 'EUR';
  if (u === 'USD' || u === 'US$') return 'USD';
  if (u === 'BRL' || u === 'R$') return 'BRL';
  return fallback;
}

const EXPENSE_RULES: [RegExp, string][] = [
  [/\b(lidl|aldi|continente|pingo doce|carrefour|assai|pao de acucar|mercado|supermercado|mercadona|auchan|mini preco)\b/, 'Mercado'],
  [/\b(ifood|uber eats|glovo|bolt food|restaurante|cafe|padaria|starbucks|mcdonald|burger|pizza|sushi|padoca|lanchonete)\b/, 'Alimentação'],
  [/\b(uber|bolt|99|metro|cp |carris|combustivel|posto|shell|ipiranga|galp|estacionamento|pedagio|via verde|ryanair|tap |latam|gol |azul)\b/, 'Transporte'],
  [/\b(spotify|netflix|apple|icloud|google one|openai|chatgpt|claude|anthropic|amazon prime|disney|hbo|youtube|github|vercel|notion)\b/, 'Assinaturas'],
  [/\b(farmacia|drogaria|drogasil|raia|medico|clinica|dentista|academia|smart fit|gym|suplement|whey)\b/, 'Saúde'],
  [/\b(aluguel|rent|condominio|iptu|luz|energia|edp|agua|internet|vivo|claro|tim|meo|nos|vodafone)\b/, 'Moradia'],
  [/\b(udemy|coursera|livro|amazon|fnac|escola|curso|faculdade)\b/, 'Educação'],
  [/\b(cinema|teatro|bar|show|ingresso|viagem|hotel|airbnb|booking)\b/, 'Lazer'],
  [/\b(imposto|irpf|financas|taxa|iof)\b/, 'Impostos'],
];

const INCOME_RULES: [RegExp, string][] = [
  [/\b(salario|salary|payroll|pagamento|ordenado)\b/, 'Salário'],
  [/\b(reembolso|refund|estorno|cashback)\b/, 'Reembolso'],
  [/\b(dividendo|rendimento|juros|interest|cdb|tesouro)\b/, 'Rendimentos'],
  [/\b(freelance|consultoria|invoice|cliente)\b/, 'Freelance'],
];

/** Suggests a category from merchant/description keywords. */
export function guessCategory(description: string, type: TxType): string {
  const key = searchKey(description);
  const rules = type === 'income' ? INCOME_RULES : EXPENSE_RULES;
  for (const [re, cat] of rules) {
    if (re.test(key)) return cat;
  }
  return 'Outros';
}

/** Checks if a parsed CSV transaction matches an existing transaction (date + amount + description). */
export function isDuplicateTx(
  candidate: Pick<ParsedCsvRow, 'date' | 'type' | 'amount' | 'currency' | 'description'>,
  existing: readonly Tx[],
): boolean {
  const candDesc = searchKey(candidate.description);
  return existing.some((t) => {
    if (t.date !== candidate.date || t.type !== candidate.type) return false;
    const sameCurrency = (t.currency ?? 'BRL') === candidate.currency;
    const compareAmt = sameCurrency && t.currency && t.currency !== 'BRL' && t.original_amount != null
      ? Number(t.original_amount)
      : Number(t.amount);
    if (Math.abs(compareAmt - candidate.amount) > 0.015) return false;
    const exDesc = searchKey(t.description);
    if (!candDesc || !exDesc) return true;
    return exDesc === candDesc || exDesc.includes(candDesc) || candDesc.includes(exDesc);
  });
}

/** Parses a bank statement CSV (Revolut, Wise, Nubank/BR, or generic) with duplicate flagging. */
export function parseBankStatement(
  rawCsv: string,
  existingTxs: readonly Tx[] = [],
  defaultCurrency: Currency = 'BRL',
): CsvParseResult {
  const { rows } = parseCsvRows(rawCsv);
  if (rows.length < 2) {
    return { format: 'generic', rows: [], skippedCount: 0, warnings: ['Arquivo vazio ou sem linhas de lançamento.'] };
  }

  const header = rows[0].map((h) => searchKey(h));
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  let format: BankCsvFormat = 'generic';
  if (header.includes('started date') && header.includes('state') && header.includes('currency')) {
    format = 'revolut';
  } else if (header.some((h) => h.includes('transferwise') || h === 'wise id') || (header.includes('date') && header.includes('amount') && header.includes('currency') && header.includes('description'))) {
    format = 'wise';
  } else if (header.includes('identificador') && header.includes('valor') && header.includes('descricao')) {
    format = 'nubank';
  }

  const idxDate = col('completed date', 'started date', 'data lancamento', 'data', 'date');
  const idxFallbackDate = col('started date', 'data', 'date');
  const idxDesc = col('description', 'descricao', 'historico', 'title', 'estabelecimento', 'merchant', 'memo', 'lancamento');
  const idxAmount = col('amount', 'valor', 'value', 'quantia');
  const idxCurrency = col('currency', 'moeda');
  const idxState = col('state', 'status', 'situacao');
  const idxType = col('type', 'tipo');

  if (idxDate < 0 || idxAmount < 0) {
    return {
      format,
      rows: [],
      skippedCount: rows.length - 1,
      warnings: ['Não foi possível identificar as colunas de Data e Valor neste CSV.'],
    };
  }

  const parsed: ParsedCsvRow[] = [];
  let skippedCount = 0;
  const warnings: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (idxState >= 0) {
      const st = searchKey(r[idxState] ?? '');
      if (st === 'reverted' || st === 'failed' || st === 'declined' || st === 'cancelled' || st === 'cancelado') {
        skippedCount++;
        continue;
      }
    }

    const date = parseStatementDate(r[idxDate] ?? '') ?? (idxFallbackDate >= 0 ? parseStatementDate(r[idxFallbackDate] ?? '') : null);
    const signed = parseStatementAmount(r[idxAmount] ?? '');
    if (!date || signed === null || signed === 0) {
      skippedCount++;
      continue;
    }

    let type: TxType = signed < 0 ? 'expense' : 'income';
    if (idxType >= 0 && signed > 0) {
      const tp = searchKey(r[idxType] ?? '');
      if (tp === 'debit' || tp === 'debito' || tp === 'saida' || tp === 'expense') type = 'expense';
    }

    const description = (idxDesc >= 0 ? r[idxDesc] : '')?.trim() || 'Lançamento importado';
    const currency = idxCurrency >= 0 ? normalizeCurrency(r[idxCurrency], defaultCurrency) : defaultCurrency;
    const amount = Math.round(Math.abs(signed) * 100) / 100;
    const category = guessCategory(description, type);
    const duplicate = isDuplicateTx({ date, type, amount, currency, description }, existingTxs);

    parsed.push({ rowIndex: i, date, description, type, amount, currency, category, duplicate });
  }

  if (parsed.length === 0) {
    warnings.push('Nenhum lançamento válido encontrado no arquivo.');
  }
  return { format, rows: parsed, skippedCount, warnings };
}

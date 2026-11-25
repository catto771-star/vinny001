import { useEffect, useRef, useState, type FormEvent } from 'react';
import { num } from '../../lib/format';
import { ArrowLeft, Camera, ScanBarcode, Star, StopCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { netCarbsG, nutrientsFor, type Food } from '../../lib/nutrition';
import {
  measuresForFood,
  micronutrientsPer100g,
  scaleMicronutrients,
  type MicronutrientMap,
} from '../../lib/micronutrients';
import { lookupBarcodeUrl, offToFood, sanitizeBarcode, type FoodCountry, type OffProduct } from '../../lib/off';
import { searchKey, searchWords } from '../../lib/text';
import type { QuickFood } from '../../lib/diary';
import { Field, Modal } from '../../components/ui';

export interface FoodPickMeta {
  measure_label: string;
  measure_qty: number;
  logged_time: string | null;
  nutrients: MicronutrientMap;
  is_supplement: boolean;
}

const SOURCES = ['Recentes', 'Favoritos', 'Frequentes', 'Tabelas', 'Produtos de marca', 'Código de barras', 'Novo alimento'] as const;
const REGIONS: { id: FoodCountry | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'Todos' }, { id: 'BR', label: 'Brasil (TACO)' }, { id: 'UK', label: 'Reino Unido e Irlanda (CoFID)' },
];
const COLUMNS = 'id,name,brand,source,country,kcal,protein_g,carbs_g,fat_g,fiber_g,default_serving_g,nutrients,measures,is_supplement';

/** Finds a food in built-in tables, favorites, Open Food Facts, barcode scanner or custom food, then asks for serving measure & quantity. */
export default function FoodSearch({
  title,
  onPick,
  onClose,
  recent = [],
  frequent = [],
  favoriteIds,
  onToggleFavorite,
  allowTimestamp = false,
}: {
  title: string;
  onPick: (food: Food, grams: number, meta?: FoodPickMeta) => void | Promise<void>;
  onClose: () => void;
  recent?: QuickFood[];
  frequent?: QuickFood[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (foodId: string) => void | Promise<void>;
  allowTimestamp?: boolean;
}) {
  const [source, setSource] = useState<(typeof SOURCES)[number]>(recent.length ? 'Recentes' : 'Tabelas');
  const [quickGrams, setQuickGrams] = useState<number | null>(null);
  const [region, setRegion] = useState<FoodCountry | 'ALL'>('ALL');
  const [offCountry, setOffCountry] = useState<FoodCountry>('BR');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [favoriteFoods, setFavoriteFoods] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Food | null>(null);

  useEffect(() => {
    if (source !== 'Favoritos') return;
    const ids = favoriteIds ? [...favoriteIds] : [];
    if (!ids.length) {
      setFavoriteFoods([]);
      return;
    }
    supabase
      .from('foods')
      .select(COLUMNS)
      .in('id', ids)
      .order('name')
      .then(({ data }) => setFavoriteFoods((data ?? []) as Food[]));
  }, [source, favoriteIds]);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (source === 'Tabelas') {
        let query = supabase.from('foods').select(COLUMNS).order('name').limit(40);
        for (const w of searchWords(q)) query = query.ilike('search_name', `%${w}%`);
        if (region === 'BR') query = query.or('source.eq.TACO,country.eq.BR');
        if (region === 'UK' || region === 'IE') query = query.or('source.eq.CoFID,country.in.(UK,IE)');
        const { data, error } = await query;
        if (error) throw error;
        setResults((data ?? []) as Food[]);
        if (!data?.length) setMessage('Nada encontrado. Tente outra palavra ou a aba Produtos de marca.');
      } else {
        const { data, error } = await supabase.functions.invoke('food-search', { body: { q, country: offCountry } });
        if (error) throw error;
        const foods = ((data?.hits ?? []) as OffProduct[]).map((p) => offToFood(p, offCountry)).filter((f) => f !== null);
        setResults(foods.map((f) => ({ ...f, id: `off:${f.external_id}` })));
        if (!foods.length) setMessage('Nenhum produto com informação nutricional encontrado.');
      }
    } catch (err) {
      setMessage(`Não foi possível buscar: ${(err as Error).message}`);
    }
    setBusy(false);
  }

  /** Products from Open Food Facts are saved as the user's own foods before use. */
  async function persist(food: Food): Promise<Food | null> {
    if (!food.id.startsWith('off:')) return food;
    const ext = food.id.slice(4);
    const { data: found } = await supabase.from('foods').select(COLUMNS).eq('source', 'OFF').eq('external_id', ext).not('user_id', 'is', null).maybeSingle();
    if (found) return found as Food;
    const { id: _ignored, ...row } = food;
    void _ignored;
    const { data, error } = await supabase.from('foods').insert({ ...row, external_id: ext, search_name: searchKey(food.name) }).select(COLUMNS).single();
    if (error) { alert(`Não foi possível salvar o produto: ${error.message}`); return null; }
    return data as Food;
  }

  async function pickQuick(qf: QuickFood) {
    const { data, error } = await supabase.from('foods').select(COLUMNS).eq('id', qf.food_id).maybeSingle();
    if (error || !data) return setMessage('Esse alimento não está mais disponível');
    setQuickGrams(qf.quantity_g);
    setChosen(data as Food);
  }

  if (chosen) {
    const isFav = !chosen.id.startsWith('off:') && !!favoriteIds?.has(chosen.id);
    return (
      <QuantityStep
        food={chosen}
        initialGrams={quickGrams}
        title={title}
        allowTimestamp={allowTimestamp}
        isFavorite={isFav}
        onToggleFavorite={!chosen.id.startsWith('off:') && onToggleFavorite ? () => onToggleFavorite(chosen.id) : undefined}
        onBack={() => { setChosen(null); setQuickGrams(null); }}
        onClose={onClose}
        onConfirm={async (grams, meta) => {
          const food = await persist(chosen);
          if (food) await onPick(food, grams, meta);
        }}
      />
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="segmented mb-4 max-w-full overflow-x-auto">
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            className={s === source ? 'tab-active' : 'tab'}
            onClick={() => { setSource(s); setResults([]); setMessage(null); }}
          >
            {s}
          </button>
        ))}
      </div>

      {(source === 'Recentes' || source === 'Frequentes') ? (
        <ul className="max-h-80 overflow-y-auto">
          {(source === 'Recentes' ? recent : frequent).map((qf) => (
            <li key={qf.food_id} className="flex items-center gap-1">
              <button className="flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-raised" onClick={() => pickQuick(qf)}>
                <div>{qf.food_name}</div>
                <div className="text-xs text-fg3">
                  {num(qf.quantity_g)} g da última vez{source === 'Frequentes' ? ` · ${qf.count} ${qf.count === 1 ? 'vez' : 'vezes'}` : ''}
                </div>
              </button>
              {onToggleFavorite && (
                <button
                  type="button"
                  className={`icon-btn ${favoriteIds?.has(qf.food_id) ? 'text-warning' : 'text-fg3'}`}
                  aria-label="Favoritar alimento"
                  onClick={() => void onToggleFavorite(qf.food_id)}
                >
                  <Star size={15} strokeWidth={1.5} fill={favoriteIds?.has(qf.food_id) ? 'currentColor' : 'none'} />
                </button>
              )}
            </li>
          ))}
          {!(source === 'Recentes' ? recent : frequent).length && (
            <li className="py-6 text-center text-sm text-fg3">Os alimentos que você registrar aparecem aqui</li>
          )}
          {message && <li className="py-2 text-sm text-fg3">{message}</li>}
        </ul>
      ) : source === 'Favoritos' ? (
        <ul className="max-h-80 overflow-y-auto">
          {favoriteFoods.map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <button className="flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-raised" onClick={() => setChosen(f)}>
                <div>{f.name}{f.brand ? <span className="text-fg3"> · {f.brand}</span> : null}</div>
                <div className="text-xs text-fg3">
                  {num(f.kcal)} kcal · P {num(f.protein_g)} · C {num(f.carbs_g)} · G {num(f.fat_g)} por 100 g
                </div>
              </button>
              {onToggleFavorite && (
                <button
                  type="button"
                  className="icon-btn text-warning"
                  aria-label={`Remover ${f.name} dos favoritos`}
                  onClick={() => void onToggleFavorite(f.id)}
                >
                  <Star size={15} strokeWidth={1.5} fill="currentColor" />
                </button>
              )}
            </li>
          ))}
          {!favoriteFoods.length && (
            <li className="py-6 text-center text-sm text-fg3">
              Marque a estrela nos seus alimentos preferidos para acessá-los com 1 clique aqui.
            </li>
          )}
        </ul>
      ) : source === 'Código de barras' ? (
        <BarcodeLookup country={offCountry} onFound={setChosen} />
      ) : source === 'Novo alimento' ? (
        <CustomFood onCreated={setChosen} />
      ) : (
        <>
          <form onSubmit={search} className="mb-2 flex gap-2">
            <input
              className="input"
              placeholder={source === 'Tabelas' ? 'arroz integral, ovo cozido, espinafre…' : 'aveia, whey, iogurte…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              required
            />
            <button className="btn-primary" disabled={busy}>{busy ? '…' : 'Buscar'}</button>
          </form>
          <div className="mb-3 flex flex-wrap gap-1">
            {source === 'Tabelas'
              ? REGIONS.map((r) => <button key={r.id} type="button" className={r.id === region ? 'tab-active' : 'tab'} onClick={() => setRegion(r.id)}>{r.label}</button>)
              : (['BR', 'IE', 'UK'] as FoodCountry[]).map((c) => <button key={c} type="button" className={c === offCountry ? 'tab-active' : 'tab'} onClick={() => setOffCountry(c)}>{{ BR: 'Brasil', IE: 'Irlanda', UK: 'Reino Unido' }[c]}</button>)}
          </div>
          {message && <p className="mb-2 text-sm text-fg3">{message}</p>}
          <ul className="max-h-72 overflow-y-auto">
            {results.map((f) => (
              <li key={f.id} className="flex items-center gap-1">
                <button className="flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-raised" onClick={() => setChosen(f)}>
                  <div>{f.name}{f.brand ? <span className="text-fg3"> · {f.brand}</span> : null}</div>
                  <div className="text-xs text-fg3">{num(f.kcal)} kcal · P {num(f.protein_g)} · C {num(f.carbs_g)} · G {num(f.fat_g)} por 100 g · {f.source}</div>
                </button>
                {!f.id.startsWith('off:') && onToggleFavorite && (
                  <button
                    type="button"
                    className={`icon-btn ${favoriteIds?.has(f.id) ? 'text-warning' : 'text-fg3'}`}
                    aria-label="Favoritar alimento"
                    onClick={() => void onToggleFavorite(f.id)}
                  >
                    <Star size={15} strokeWidth={1.5} fill={favoriteIds?.has(f.id) ? 'currentColor' : 'none'} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
}

function BarcodeLookup({ country, onFound }: { country: FoodCountry; onFound: (food: Food) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const supportsCameraScanner = typeof window !== 'undefined'
    && 'BarcodeDetector' in window
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;

  function stopCamera() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => () => stopCamera(), []);

  async function lookup(raw: string) {
    const clean = sanitizeBarcode(raw);
    if (!clean) {
      setStatus('Informe um código de barras válido (8 a 14 dígitos).');
      return;
    }
    setCode(clean);
    setBusy(true);
    setStatus(null);
    try {
      let product: OffProduct | null = null;
      const { data, error } = await supabase.functions.invoke('food-search', { body: { barcode: clean, country } });
      if (!error && Array.isArray(data?.hits) && data.hits[0]) {
        product = data.hits[0] as OffProduct;
      } else {
        const res = await fetch(lookupBarcodeUrl(clean));
        if (res.ok) {
          const body = await res.json() as { status?: number; product?: OffProduct };
          if (body.status === 1 && body.product) product = { ...body.product, code: body.product.code ?? clean };
        }
      }
      const mapped = product ? offToFood(product, country) : null;
      if (!mapped) {
        setStatus(`Produto ${clean} não encontrado ou sem tabela nutricional no Open Food Facts.`);
      } else {
        stopCamera();
        onFound({ ...mapped, id: `off:${mapped.external_id}` });
      }
    } catch (err) {
      setStatus(`Erro ao consultar código: ${(err as Error).message}`);
    }
    setBusy(false);
  }

  async function startCamera() {
    setStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setScanning(true);
      window.setTimeout(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const DetectorCtor = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        const detector = new DetectorCtor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const raw = found.find((f) => f.rawValue)?.rawValue;
            if (raw) {
              stopCamera();
              void lookup(raw);
              return;
            }
          } catch { /* keep scanning */ }
          rafRef.current = requestAnimationFrame(() => { void tick(); });
        };
        rafRef.current = requestAnimationFrame(() => { void tick(); });
      }, 60);
    } catch {
      stopCamera();
      setStatus('Não foi possível abrir a câmera. Digite o código de barras manualmente abaixo.');
    }
  }

  return (
    <div className="space-y-3">
      {scanning ? (
        <div className="relative overflow-hidden rounded-xl border border-line bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-brand/80" />
          <button type="button" className="btn-secondary absolute right-2 bottom-2 h-8 text-xs" onClick={stopCamera}>
            <StopCircle size={14} strokeWidth={1.6} aria-hidden="true" />Parar câmera
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-raised/40 p-3 text-center">
          <ScanBarcode size={24} strokeWidth={1.5} className="mx-auto mb-1.5 text-fg3" aria-hidden="true" />
          <p className="mb-2 text-xs text-fg2">Leia o código de barras de qualquer embalagem via Open Food Facts.</p>
          {supportsCameraScanner ? (
            <button type="button" className="btn-secondary" onClick={() => void startCamera()}>
              <Camera size={15} strokeWidth={1.6} aria-hidden="true" />Abrir leitor da câmera
            </button>
          ) : (
            <p className="text-[11px] text-fg3">Leitura por câmera disponível em navegadores móveis compatíveis (Chrome/Android). Digite o código abaixo:</p>
          )}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void lookup(code); }} className="flex gap-2">
        <input
          className="input figure"
          inputMode="numeric"
          placeholder="Ex.: 7891000100103"
          aria-label="Código de barras do produto"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button className="btn-primary shrink-0" disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {status && <p className="text-xs text-fg2">{status}</p>}
    </div>
  );
}

function QuantityStep({
  food,
  initialGrams,
  title,
  allowTimestamp,
  isFavorite,
  onToggleFavorite,
  onBack,
  onClose,
  onConfirm,
}: {
  food: Food;
  initialGrams?: number | null;
  title: string;
  allowTimestamp?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void | Promise<void>;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (grams: number, meta: FoodPickMeta) => Promise<void>;
}) {
  const measures = measuresForFood(food);
  // Default to household measure #0 unless `initialGrams` came from QuickFood history (use Gramas 1g)
  const defaultIdx = initialGrams != null
    ? Math.max(0, measures.findIndex((m) => m.grams === 1))
    : 0;
  const [measureIdx, setMeasureIdx] = useState(defaultIdx);
  const selectedMeasure = measures[measureIdx] ?? { label: 'Gramas (g)', grams: 1 };
  const [qty, setQty] = useState<number>(() => {
    if (initialGrams != null) return initialGrams;
    return selectedMeasure.grams === 1 ? (food.default_serving_g ?? 100) : 1;
  });
  const [loggedTime, setLoggedTime] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const grams = Math.max(0.1, Math.round(qty * selectedMeasure.grams * 10) / 10);
  const n = nutrientsFor(food, grams);
  const micro100 = micronutrientsPer100g(food);
  const scaledMicro = scaleMicronutrients(micro100, grams);
  const listedMicroCount = Object.keys(micro100).length;

  function handleMeasureChange(idx: number) {
    const next = measures[idx];
    if (!next) return;
    setMeasureIdx(idx);
    if (next.grams === 1) {
      setQty(grams);
    } else {
      setQty(1);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onConfirm(grams, {
            measure_label: selectedMeasure.label,
            measure_qty: qty,
            logged_time: loggedTime || null,
            nutrients: scaledMicro,
            is_supplement: !!food.is_supplement,
          });
          setBusy(false);
        }}
      >
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-fg">{food.name}</div>
            <div className="text-xs text-fg3">
              Fonte: {food.source}{listedMicroCount > 0 ? ` · ${listedMicroCount + 5} nutrientes mapeados` : ''}
            </div>
          </div>
          {onToggleFavorite && (
            <button
              type="button"
              className={`icon-btn ${isFavorite ? 'text-warning' : 'text-fg3'}`}
              aria-label="Alternar favorito"
              onClick={() => void onToggleFavorite()}
            >
              <Star size={16} strokeWidth={1.5} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade">
            <input
              className="input figure"
              type="number"
              min={0.1}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              autoFocus
              required
            />
          </Field>
          <Field label="Medida / Porção">
            <select
              className="input"
              aria-label="Medida caseira"
              value={measureIdx}
              onChange={(e) => handleMeasureChange(Number(e.target.value))}
            >
              {measures.map((m, idx) => (
                <option key={`${m.label}-${idx}`} value={idx}>
                  {m.grams === 1 ? 'Gramas (g)' : m.label.includes('g)') ? m.label : `${m.label} (${m.grams} g)`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {allowTimestamp && (
          <Field label="Horário no diário (opcional)">
            <input
              className="input w-40"
              type="time"
              value={loggedTime}
              onChange={(e) => setLoggedTime(e.target.value)}
            />
          </Field>
        )}

        <div className="mb-4 rounded-xl border border-line bg-raised/40 p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-fg3">Peso equivalente: <strong className="figure text-fg2">{num(grams)} g</strong></span>
            <span className="figure font-medium text-fg">{num(n.kcal)} kcal</span>
          </div>
          <div className="mt-1.5 text-xs text-fg2">
            Proteína <span className="figure font-medium">{num(n.protein_g)} g</span> · Carbo <span className="figure font-medium">{num(n.carbs_g)} g</span> (Líq. <span className="figure">{num(netCarbsG(n.carbs_g, n.fiber_g))} g</span>) · Gordura <span className="figure font-medium">{num(n.fat_g)} g</span> · Fibra <span className="figure">{num(n.fiber_g)} g</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} strokeWidth={1.5} />Voltar
          </button>
          <button className="btn-primary ml-auto" disabled={busy}>Adicionar ao diário</button>
        </div>
      </form>
    </Modal>
  );
}

function CustomFood({ onCreated }: { onCreated: (f: Food) => void }) {
  const [v, setV] = useState({
    name: '',
    kcal: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
    fiber_g: '',
    default_serving_g: '100',
    measure_label: '',
    sodium_mg: '',
    potassium_mg: '',
    calcium_mg: '',
    iron_mg: '',
  });
  const [isSupplement, setIsSupplement] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const servingG = Number(v.default_serving_g || 100);
    const measures = v.measure_label.trim()
      ? [{ label: v.measure_label.trim(), grams: servingG }]
      : [];
    const nutrients: MicronutrientMap = {};
    if (v.sodium_mg) nutrients.sodium_mg = Number(v.sodium_mg);
    if (v.potassium_mg) nutrients.potassium_mg = Number(v.potassium_mg);
    if (v.calcium_mg) nutrients.calcium_mg = Number(v.calcium_mg);
    if (v.iron_mg) nutrients.iron_mg = Number(v.iron_mg);

    const row = {
      source: 'custom',
      name: v.name,
      search_name: searchKey(v.name),
      kcal: Number(v.kcal),
      protein_g: Number(v.protein_g || 0),
      carbs_g: Number(v.carbs_g || 0),
      fat_g: Number(v.fat_g || 0),
      fiber_g: v.fiber_g ? Number(v.fiber_g) : null,
      default_serving_g: servingG,
      measures,
      nutrients,
      is_supplement: isSupplement,
    };
    const { data, error } = await supabase.from('foods').insert(row).select(COLUMNS).single();
    if (error) return alert(`Não foi possível salvar: ${error.message}`);
    onCreated(data as Food);
  }

  return (
    <form onSubmit={save}>
      <Field label="Nome"><input className="input" value={v.name} onChange={set('name')} placeholder="Ex.: Whey Isolado Baunilha" required /></Field>
      <p className="mb-2 text-xs text-fg3">Valores por 100 g (conforme rótulo nutricional).</p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="kcal"><input className="input" type="number" min={0} step="any" value={v.kcal} onChange={set('kcal')} required /></Field>
        <Field label="Proteína (g)"><input className="input" type="number" min={0} step="any" value={v.protein_g} onChange={set('protein_g')} /></Field>
        <Field label="Carboidrato (g)"><input className="input" type="number" min={0} step="any" value={v.carbs_g} onChange={set('carbs_g')} /></Field>
        <Field label="Gordura (g)"><input className="input" type="number" min={0} step="any" value={v.fat_g} onChange={set('fat_g')} /></Field>
        <Field label="Fibra (g)"><input className="input" type="number" min={0} step="any" value={v.fiber_g} onChange={set('fiber_g')} /></Field>
        <Field label="Porção (g)"><input className="input" type="number" min={1} step="any" value={v.default_serving_g} onChange={set('default_serving_g')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nome da medida caseira (opcional)">
          <input className="input" placeholder="Ex.: 1 scoop, 2 cápsulas" value={v.measure_label} onChange={set('measure_label')} />
        </Field>
        <Field label="Sódio mg / 100 g (opcional)">
          <input className="input" type="number" min={0} step="any" value={v.sodium_mg} onChange={set('sodium_mg')} />
        </Field>
      </div>
      <label className="mb-4 flex items-center gap-2 text-xs text-fg2">
        <input type="checkbox" checked={isSupplement} onChange={(e) => setIsSupplement(e.target.checked)} />
        É suplemento alimentar (permite filtrar Com/Sem Suplementos nos relatórios)
      </label>
      <button className="btn-primary w-full justify-center">Salvar e continuar</button>
    </form>
  );
}

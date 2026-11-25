import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { num } from '../../lib/format';
import { ArrowLeft, Camera, ScanBarcode, Star, StopCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { netCarbsG, nutrientsFor } from '../../lib/nutrition';
import { measuresForFood, micronutrientsPer100g, scaleMicronutrients, } from '../../lib/micronutrients';
import { lookupBarcodeUrl, offToFood, sanitizeBarcode } from '../../lib/off';
import { searchKey, searchWords } from '../../lib/text';
import { Field, Modal } from '../../components/ui';
const SOURCES = ['Recentes', 'Favoritos', 'Frequentes', 'Tabelas', 'Produtos de marca', 'Código de barras', 'Novo alimento'];
const REGIONS = [
    { id: 'ALL', label: 'Todos' }, { id: 'BR', label: 'Brasil (TACO)' }, { id: 'UK', label: 'Reino Unido e Irlanda (CoFID)' },
];
const COLUMNS = 'id,name,brand,source,country,kcal,protein_g,carbs_g,fat_g,fiber_g,default_serving_g,nutrients,measures,is_supplement';
/** Finds a food in built-in tables, favorites, Open Food Facts, barcode scanner or custom food, then asks for serving measure & quantity. */
export default function FoodSearch({ title, onPick, onClose, recent = [], frequent = [], favoriteIds, onToggleFavorite, allowTimestamp = false, }) {
    const [source, setSource] = useState(recent.length ? 'Recentes' : 'Tabelas');
    const [quickGrams, setQuickGrams] = useState(null);
    const [region, setRegion] = useState('ALL');
    const [offCountry, setOffCountry] = useState('BR');
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [favoriteFoods, setFavoriteFoods] = useState([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [chosen, setChosen] = useState(null);
    useEffect(() => {
        if (source !== 'Favoritos')
            return;
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
            .then(({ data }) => setFavoriteFoods((data ?? [])));
    }, [source, favoriteIds]);
    async function search(e) {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            if (source === 'Tabelas') {
                let query = supabase.from('foods').select(COLUMNS).order('name').limit(40);
                for (const w of searchWords(q))
                    query = query.ilike('search_name', `%${w}%`);
                if (region === 'BR')
                    query = query.or('source.eq.TACO,country.eq.BR');
                if (region === 'UK' || region === 'IE')
                    query = query.or('source.eq.CoFID,country.in.(UK,IE)');
                const { data, error } = await query;
                if (error)
                    throw error;
                setResults((data ?? []));
                if (!data?.length)
                    setMessage('Nada encontrado. Tente outra palavra ou a aba Produtos de marca.');
            }
            else {
                const { data, error } = await supabase.functions.invoke('food-search', { body: { q, country: offCountry } });
                if (error)
                    throw error;
                const foods = (data?.hits ?? []).map((p) => offToFood(p, offCountry)).filter((f) => f !== null);
                setResults(foods.map((f) => ({ ...f, id: `off:${f.external_id}` })));
                if (!foods.length)
                    setMessage('Nenhum produto com informação nutricional encontrado.');
            }
        }
        catch (err) {
            setMessage(`Não foi possível buscar: ${err.message}`);
        }
        setBusy(false);
    }
    /** Products from Open Food Facts are saved as the user's own foods before use. */
    async function persist(food) {
        if (!food.id.startsWith('off:'))
            return food;
        const ext = food.id.slice(4);
        const { data: found } = await supabase.from('foods').select(COLUMNS).eq('source', 'OFF').eq('external_id', ext).not('user_id', 'is', null).maybeSingle();
        if (found)
            return found;
        const { id: _ignored, ...row } = food;
        void _ignored;
        const { data, error } = await supabase.from('foods').insert({ ...row, external_id: ext, search_name: searchKey(food.name) }).select(COLUMNS).single();
        if (error) {
            alert(`Não foi possível salvar o produto: ${error.message}`);
            return null;
        }
        return data;
    }
    async function pickQuick(qf) {
        const { data, error } = await supabase.from('foods').select(COLUMNS).eq('id', qf.food_id).maybeSingle();
        if (error || !data)
            return setMessage('Esse alimento não está mais disponível');
        setQuickGrams(qf.quantity_g);
        setChosen(data);
    }
    if (chosen) {
        const isFav = !chosen.id.startsWith('off:') && !!favoriteIds?.has(chosen.id);
        return (_jsx(QuantityStep, { food: chosen, initialGrams: quickGrams, title: title, allowTimestamp: allowTimestamp, isFavorite: isFav, onToggleFavorite: !chosen.id.startsWith('off:') && onToggleFavorite ? () => onToggleFavorite(chosen.id) : undefined, onBack: () => { setChosen(null); setQuickGrams(null); }, onClose: onClose, onConfirm: async (grams, meta) => {
                const food = await persist(chosen);
                if (food)
                    await onPick(food, grams, meta);
            } }));
    }
    return (_jsxs(Modal, { title: title, onClose: onClose, children: [_jsx("div", { className: "segmented mb-4 max-w-full overflow-x-auto", children: SOURCES.map((s) => (_jsx("button", { type: "button", className: s === source ? 'tab-active' : 'tab', onClick: () => { setSource(s); setResults([]); setMessage(null); }, children: s }, s))) }), (source === 'Recentes' || source === 'Frequentes') ? (_jsxs("ul", { className: "max-h-80 overflow-y-auto", children: [(source === 'Recentes' ? recent : frequent).map((qf) => (_jsxs("li", { className: "flex items-center gap-1", children: [_jsxs("button", { className: "flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-raised", onClick: () => pickQuick(qf), children: [_jsx("div", { children: qf.food_name }), _jsxs("div", { className: "text-xs text-fg3", children: [num(qf.quantity_g), " g da \u00FAltima vez", source === 'Frequentes' ? ` · ${qf.count} ${qf.count === 1 ? 'vez' : 'vezes'}` : ''] })] }), onToggleFavorite && (_jsx("button", { type: "button", className: `icon-btn ${favoriteIds?.has(qf.food_id) ? 'text-warning' : 'text-fg3'}`, "aria-label": "Favoritar alimento", onClick: () => void onToggleFavorite(qf.food_id), children: _jsx(Star, { size: 15, strokeWidth: 1.5, fill: favoriteIds?.has(qf.food_id) ? 'currentColor' : 'none' }) }))] }, qf.food_id))), !(source === 'Recentes' ? recent : frequent).length && (_jsx("li", { className: "py-6 text-center text-sm text-fg3", children: "Os alimentos que voc\u00EA registrar aparecem aqui" })), message && _jsx("li", { className: "py-2 text-sm text-fg3", children: message })] })) : source === 'Favoritos' ? (_jsxs("ul", { className: "max-h-80 overflow-y-auto", children: [favoriteFoods.map((f) => (_jsxs("li", { className: "flex items-center gap-1", children: [_jsxs("button", { className: "flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-raised", onClick: () => setChosen(f), children: [_jsxs("div", { children: [f.name, f.brand ? _jsxs("span", { className: "text-fg3", children: [" \u00B7 ", f.brand] }) : null] }), _jsxs("div", { className: "text-xs text-fg3", children: [num(f.kcal), " kcal \u00B7 P ", num(f.protein_g), " \u00B7 C ", num(f.carbs_g), " \u00B7 G ", num(f.fat_g), " por 100 g"] })] }), onToggleFavorite && (_jsx("button", { type: "button", className: "icon-btn text-warning", "aria-label": `Remover ${f.name} dos favoritos`, onClick: () => void onToggleFavorite(f.id), children: _jsx(Star, { size: 15, strokeWidth: 1.5, fill: "currentColor" }) }))] }, f.id))), !favoriteFoods.length && (_jsx("li", { className: "py-6 text-center text-sm text-fg3", children: "Marque a estrela nos seus alimentos preferidos para acess\u00E1-los com 1 clique aqui." }))] })) : source === 'Código de barras' ? (_jsx(BarcodeLookup, { country: offCountry, onFound: setChosen })) : source === 'Novo alimento' ? (_jsx(CustomFood, { onCreated: setChosen })) : (_jsxs(_Fragment, { children: [_jsxs("form", { onSubmit: search, className: "mb-2 flex gap-2", children: [_jsx("input", { className: "input", placeholder: source === 'Tabelas' ? 'arroz integral, ovo cozido, espinafre…' : 'aveia, whey, iogurte…', value: q, onChange: (e) => setQ(e.target.value), autoFocus: true, required: true }), _jsx("button", { className: "btn-primary", disabled: busy, children: busy ? '…' : 'Buscar' })] }), _jsx("div", { className: "mb-3 flex flex-wrap gap-1", children: source === 'Tabelas'
                            ? REGIONS.map((r) => _jsx("button", { type: "button", className: r.id === region ? 'tab-active' : 'tab', onClick: () => setRegion(r.id), children: r.label }, r.id))
                            : ['BR', 'IE', 'UK'].map((c) => _jsx("button", { type: "button", className: c === offCountry ? 'tab-active' : 'tab', onClick: () => setOffCountry(c), children: { BR: 'Brasil', IE: 'Irlanda', UK: 'Reino Unido' }[c] }, c)) }), message && _jsx("p", { className: "mb-2 text-sm text-fg3", children: message }), _jsx("ul", { className: "max-h-72 overflow-y-auto", children: results.map((f) => (_jsxs("li", { className: "flex items-center gap-1", children: [_jsxs("button", { className: "flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-raised", onClick: () => setChosen(f), children: [_jsxs("div", { children: [f.name, f.brand ? _jsxs("span", { className: "text-fg3", children: [" \u00B7 ", f.brand] }) : null] }), _jsxs("div", { className: "text-xs text-fg3", children: [num(f.kcal), " kcal \u00B7 P ", num(f.protein_g), " \u00B7 C ", num(f.carbs_g), " \u00B7 G ", num(f.fat_g), " por 100 g \u00B7 ", f.source] })] }), !f.id.startsWith('off:') && onToggleFavorite && (_jsx("button", { type: "button", className: `icon-btn ${favoriteIds?.has(f.id) ? 'text-warning' : 'text-fg3'}`, "aria-label": "Favoritar alimento", onClick: () => void onToggleFavorite(f.id), children: _jsx(Star, { size: 15, strokeWidth: 1.5, fill: favoriteIds?.has(f.id) ? 'currentColor' : 'none' }) }))] }, f.id))) })] }))] }));
}
function BarcodeLookup({ country, onFound }) {
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(null);
    const [scanning, setScanning] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
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
    async function lookup(raw) {
        const clean = sanitizeBarcode(raw);
        if (!clean) {
            setStatus('Informe um código de barras válido (8 a 14 dígitos).');
            return;
        }
        setCode(clean);
        setBusy(true);
        setStatus(null);
        try {
            let product = null;
            const { data, error } = await supabase.functions.invoke('food-search', { body: { barcode: clean, country } });
            if (!error && Array.isArray(data?.hits) && data.hits[0]) {
                product = data.hits[0];
            }
            else {
                const res = await fetch(lookupBarcodeUrl(clean));
                if (res.ok) {
                    const body = await res.json();
                    if (body.status === 1 && body.product)
                        product = { ...body.product, code: body.product.code ?? clean };
                }
            }
            const mapped = product ? offToFood(product, country) : null;
            if (!mapped) {
                setStatus(`Produto ${clean} não encontrado ou sem tabela nutricional no Open Food Facts.`);
            }
            else {
                stopCamera();
                onFound({ ...mapped, id: `off:${mapped.external_id}` });
            }
        }
        catch (err) {
            setStatus(`Erro ao consultar código: ${err.message}`);
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
                if (!video)
                    return;
                video.srcObject = stream;
                await video.play();
                const DetectorCtor = window.BarcodeDetector;
                const detector = new DetectorCtor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
                const tick = async () => {
                    if (!streamRef.current || !videoRef.current)
                        return;
                    try {
                        const found = await detector.detect(videoRef.current);
                        const raw = found.find((f) => f.rawValue)?.rawValue;
                        if (raw) {
                            stopCamera();
                            void lookup(raw);
                            return;
                        }
                    }
                    catch { /* keep scanning */ }
                    rafRef.current = requestAnimationFrame(() => { void tick(); });
                };
                rafRef.current = requestAnimationFrame(() => { void tick(); });
            }, 60);
        }
        catch {
            stopCamera();
            setStatus('Não foi possível abrir a câmera. Digite o código de barras manualmente abaixo.');
        }
    }
    return (_jsxs("div", { className: "space-y-3", children: [scanning ? (_jsxs("div", { className: "relative overflow-hidden rounded-xl border border-line bg-black", children: [_jsx("video", { ref: videoRef, playsInline: true, muted: true, className: "aspect-video w-full object-cover" }), _jsx("div", { className: "pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-brand/80" }), _jsxs("button", { type: "button", className: "btn-secondary absolute right-2 bottom-2 h-8 text-xs", onClick: stopCamera, children: [_jsx(StopCircle, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }), "Parar c\u00E2mera"] })] })) : (_jsxs("div", { className: "rounded-xl border border-line bg-raised/40 p-3 text-center", children: [_jsx(ScanBarcode, { size: 24, strokeWidth: 1.5, className: "mx-auto mb-1.5 text-fg3", "aria-hidden": "true" }), _jsx("p", { className: "mb-2 text-xs text-fg2", children: "Leia o c\u00F3digo de barras de qualquer embalagem via Open Food Facts." }), supportsCameraScanner ? (_jsxs("button", { type: "button", className: "btn-secondary", onClick: () => void startCamera(), children: [_jsx(Camera, { size: 15, strokeWidth: 1.6, "aria-hidden": "true" }), "Abrir leitor da c\u00E2mera"] })) : (_jsx("p", { className: "text-[11px] text-fg3", children: "Leitura por c\u00E2mera dispon\u00EDvel em navegadores m\u00F3veis compat\u00EDveis (Chrome/Android). Digite o c\u00F3digo abaixo:" }))] })), _jsxs("form", { onSubmit: (e) => { e.preventDefault(); void lookup(code); }, className: "flex gap-2", children: [_jsx("input", { className: "input figure", inputMode: "numeric", placeholder: "Ex.: 7891000100103", "aria-label": "C\u00F3digo de barras do produto", value: code, onChange: (e) => setCode(e.target.value), required: true }), _jsx("button", { className: "btn-primary shrink-0", disabled: busy, children: busy ? 'Buscando…' : 'Buscar' })] }), status && _jsx("p", { className: "text-xs text-fg2", children: status })] }));
}
function QuantityStep({ food, initialGrams, title, allowTimestamp, isFavorite, onToggleFavorite, onBack, onClose, onConfirm, }) {
    const measures = measuresForFood(food);
    // Default to household measure #0 unless `initialGrams` came from QuickFood history (use Gramas 1g)
    const defaultIdx = initialGrams != null
        ? Math.max(0, measures.findIndex((m) => m.grams === 1))
        : 0;
    const [measureIdx, setMeasureIdx] = useState(defaultIdx);
    const selectedMeasure = measures[measureIdx] ?? { label: 'Gramas (g)', grams: 1 };
    const [qty, setQty] = useState(() => {
        if (initialGrams != null)
            return initialGrams;
        return selectedMeasure.grams === 1 ? (food.default_serving_g ?? 100) : 1;
    });
    const [loggedTime, setLoggedTime] = useState('');
    const [busy, setBusy] = useState(false);
    const grams = Math.max(0.1, Math.round(qty * selectedMeasure.grams * 10) / 10);
    const n = nutrientsFor(food, grams);
    const micro100 = micronutrientsPer100g(food);
    const scaledMicro = scaleMicronutrients(micro100, grams);
    const listedMicroCount = Object.keys(micro100).length;
    function handleMeasureChange(idx) {
        const next = measures[idx];
        if (!next)
            return;
        setMeasureIdx(idx);
        if (next.grams === 1) {
            setQty(grams);
        }
        else {
            setQty(1);
        }
    }
    return (_jsx(Modal, { title: title, onClose: onClose, children: _jsxs("form", { onSubmit: async (e) => {
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
            }, children: [_jsxs("div", { className: "mb-3 flex items-start gap-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "font-medium text-fg", children: food.name }), _jsxs("div", { className: "text-xs text-fg3", children: ["Fonte: ", food.source, listedMicroCount > 0 ? ` · ${listedMicroCount + 5} nutrientes mapeados` : ''] })] }), onToggleFavorite && (_jsx("button", { type: "button", className: `icon-btn ${isFavorite ? 'text-warning' : 'text-fg3'}`, "aria-label": "Alternar favorito", onClick: () => void onToggleFavorite(), children: _jsx(Star, { size: 16, strokeWidth: 1.5, fill: isFavorite ? 'currentColor' : 'none' }) }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Quantidade", children: _jsx("input", { className: "input figure", type: "number", min: 0.1, step: "any", value: qty, onChange: (e) => setQty(Number(e.target.value)), autoFocus: true, required: true }) }), _jsx(Field, { label: "Medida / Por\u00E7\u00E3o", children: _jsx("select", { className: "input", "aria-label": "Medida caseira", value: measureIdx, onChange: (e) => handleMeasureChange(Number(e.target.value)), children: measures.map((m, idx) => (_jsx("option", { value: idx, children: m.grams === 1 ? 'Gramas (g)' : m.label.includes('g)') ? m.label : `${m.label} (${m.grams} g)` }, `${m.label}-${idx}`))) }) })] }), allowTimestamp && (_jsx(Field, { label: "Hor\u00E1rio no di\u00E1rio (opcional)", children: _jsx("input", { className: "input w-40", type: "time", value: loggedTime, onChange: (e) => setLoggedTime(e.target.value) }) })), _jsxs("div", { className: "mb-4 rounded-xl border border-line bg-raised/40 p-3 text-sm", children: [_jsxs("div", { className: "flex items-baseline justify-between", children: [_jsxs("span", { className: "text-xs text-fg3", children: ["Peso equivalente: ", _jsxs("strong", { className: "figure text-fg2", children: [num(grams), " g"] })] }), _jsxs("span", { className: "figure font-medium text-fg", children: [num(n.kcal), " kcal"] })] }), _jsxs("div", { className: "mt-1.5 text-xs text-fg2", children: ["Prote\u00EDna ", _jsxs("span", { className: "figure font-medium", children: [num(n.protein_g), " g"] }), " \u00B7 Carbo ", _jsxs("span", { className: "figure font-medium", children: [num(n.carbs_g), " g"] }), " (L\u00EDq. ", _jsxs("span", { className: "figure", children: [num(netCarbsG(n.carbs_g, n.fiber_g)), " g"] }), ") \u00B7 Gordura ", _jsxs("span", { className: "figure font-medium", children: [num(n.fat_g), " g"] }), " \u00B7 Fibra ", _jsxs("span", { className: "figure", children: [num(n.fiber_g), " g"] })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { type: "button", className: "btn-ghost", onClick: onBack, children: [_jsx(ArrowLeft, { size: 16, strokeWidth: 1.5 }), "Voltar"] }), _jsx("button", { className: "btn-primary ml-auto", disabled: busy, children: "Adicionar ao di\u00E1rio" })] })] }) }));
}
function CustomFood({ onCreated }) {
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
    const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
    async function save(e) {
        e.preventDefault();
        const servingG = Number(v.default_serving_g || 100);
        const measures = v.measure_label.trim()
            ? [{ label: v.measure_label.trim(), grams: servingG }]
            : [];
        const nutrients = {};
        if (v.sodium_mg)
            nutrients.sodium_mg = Number(v.sodium_mg);
        if (v.potassium_mg)
            nutrients.potassium_mg = Number(v.potassium_mg);
        if (v.calcium_mg)
            nutrients.calcium_mg = Number(v.calcium_mg);
        if (v.iron_mg)
            nutrients.iron_mg = Number(v.iron_mg);
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
        if (error)
            return alert(`Não foi possível salvar: ${error.message}`);
        onCreated(data);
    }
    return (_jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: v.name, onChange: set('name'), placeholder: "Ex.: Whey Isolado Baunilha", required: true }) }), _jsx("p", { className: "mb-2 text-xs text-fg3", children: "Valores por 100 g (conforme r\u00F3tulo nutricional)." }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(Field, { label: "kcal", children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: v.kcal, onChange: set('kcal'), required: true }) }), _jsx(Field, { label: "Prote\u00EDna (g)", children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: v.protein_g, onChange: set('protein_g') }) }), _jsx(Field, { label: "Carboidrato (g)", children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: v.carbs_g, onChange: set('carbs_g') }) }), _jsx(Field, { label: "Gordura (g)", children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: v.fat_g, onChange: set('fat_g') }) }), _jsx(Field, { label: "Fibra (g)", children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: v.fiber_g, onChange: set('fiber_g') }) }), _jsx(Field, { label: "Por\u00E7\u00E3o (g)", children: _jsx("input", { className: "input", type: "number", min: 1, step: "any", value: v.default_serving_g, onChange: set('default_serving_g') }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Nome da medida caseira (opcional)", children: _jsx("input", { className: "input", placeholder: "Ex.: 1 scoop, 2 c\u00E1psulas", value: v.measure_label, onChange: set('measure_label') }) }), _jsx(Field, { label: "S\u00F3dio mg / 100 g (opcional)", children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: v.sodium_mg, onChange: set('sodium_mg') }) })] }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-xs text-fg2", children: [_jsx("input", { type: "checkbox", checked: isSupplement, onChange: (e) => setIsSupplement(e.target.checked) }), "\u00C9 suplemento alimentar (permite filtrar Com/Sem Suplementos nos relat\u00F3rios)"] }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar e continuar" })] }));
}

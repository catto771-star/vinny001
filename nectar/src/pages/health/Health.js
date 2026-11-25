import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDay, toDay } from '../../lib/dates';
import { PageHeader } from '../../components/ui';
import { useHealth } from './useHealth';
import Today from './Today';
import Training from './Training';
import Diet from './Diet';
import DietPlan from './DietPlan';
import Dashboard from './Dashboard';
import Body from './Body';
import AssessmentPage from './AssessmentPage';
import OraclePanel from './OraclePanel';
import FastingWidget from './FastingWidget';
const TABS = ['Hoje', 'Dieta', 'Oráculo', 'Jejum', 'Treino', 'Plano', 'Corpo', 'Painel'];
export default function Health() {
    const [params, setParams] = useSearchParams();
    const initialTab = params.get('avaliacao')
        ? 'Corpo'
        : (TABS.find((t) => t.toLowerCase() === (params.get('aba') ?? '').toLowerCase()) ?? 'Hoje');
    const [tab, setTab] = useState(initialTab);
    const h = useHealth();
    // ?avaliacao=nova or ?avaliacao=<id> opens the assessment page; the browser's back button returns.
    const editing = params.get('avaliacao');
    if (editing) {
        if (h.assessments.loading)
            return null;
        return _jsx(AssessmentPage, { h: h, editId: editing === 'nova' ? null : editing, onDone: () => { setTab('Corpo'); setParams({}); } }, editing);
    }
    const error = [h.exercises, h.workouts, h.sets, h.foodLogs, h.plans].find((t) => t.error)?.error;
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Sa\u00FAde", subtitle: formatDay(toDay(new Date())), tabs: TABS, tab: tab, onTab: (t) => setTab(t) }), error && _jsx("p", { className: "mb-4 text-sm text-negative", children: error }), tab === 'Hoje' && _jsx(Today, { h: h, onGo: setTab }), tab === 'Dieta' && _jsx(Diet, { h: h, onOpenOracle: () => setTab('Oráculo') }), tab === 'Oráculo' && _jsx(OraclePanel, { h: h }), tab === 'Jejum' && _jsx(FastingWidget, { h: h }), tab === 'Treino' && _jsx(Training, { h: h }), tab === 'Plano' && _jsx(DietPlan, { h: h }), tab === 'Corpo' && _jsx(Body, { h: h, onEdit: (id) => setParams({ avaliacao: id ?? 'nova' }) }), tab === 'Painel' && _jsx(Dashboard, { h: h })] }));
}

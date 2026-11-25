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

const TABS = ['Hoje', 'Dieta', 'Oráculo', 'Jejum', 'Treino', 'Plano', 'Corpo', 'Painel'] as const;
type Tab = (typeof TABS)[number];

export default function Health() {
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('avaliacao')
    ? 'Corpo'
    : (TABS.find((t) => t.toLowerCase() === (params.get('aba') ?? '').toLowerCase()) ?? 'Hoje');
  const [tab, setTab] = useState<Tab>(initialTab);
  const h = useHealth();
  // ?avaliacao=nova or ?avaliacao=<id> opens the assessment page; the browser's back button returns.
  const editing = params.get('avaliacao');
  if (editing) {
    if (h.assessments.loading) return null;
    return <AssessmentPage key={editing} h={h} editId={editing === 'nova' ? null : editing} onDone={() => { setTab('Corpo'); setParams({}); }} />;
  }
  const error = [h.exercises, h.workouts, h.sets, h.foodLogs, h.plans].find((t) => t.error)?.error;
  return (
    <>
      <PageHeader title="Saúde" subtitle={formatDay(toDay(new Date()))} tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)} />
      {error && <p className="mb-4 text-sm text-negative">{error}</p>}
      {tab === 'Hoje' && <Today h={h} onGo={setTab} />}
      {tab === 'Dieta' && <Diet h={h} onOpenOracle={() => setTab('Oráculo')} />}
      {tab === 'Oráculo' && <OraclePanel h={h} />}
      {tab === 'Jejum' && <FastingWidget h={h} />}
      {tab === 'Treino' && <Training h={h} />}
      {tab === 'Plano' && <DietPlan h={h} />}
      {tab === 'Corpo' && <Body h={h} onEdit={(id) => setParams({ avaliacao: id ?? 'nova' })} />}
      {tab === 'Painel' && <Dashboard h={h} />}
    </>
  );
}

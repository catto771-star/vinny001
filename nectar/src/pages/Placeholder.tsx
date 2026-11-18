import { PageHeader } from '../components/ui';

export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card text-sm text-slate-500">
        Este módulo entra numa próxima fase. As tabelas dele já existem no banco.
      </div>
    </>
  );
}

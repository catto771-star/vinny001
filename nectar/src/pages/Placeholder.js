import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Hammer } from 'lucide-react';
import { Empty, PageHeader } from '../components/ui';
export default function Placeholder({ title }) {
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: title }), _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Hammer, { size: 18, strokeWidth: 1.5 }), children: "Esta se\u00E7\u00E3o entra numa pr\u00F3xima fase. As tabelas dela j\u00E1 existem no banco" }) })] }));
}

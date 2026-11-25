import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PageHeader } from '../components/ui';
import { AssistantWorkspace } from '../components/AssistantWorkspace';
export default function Assistant() {
    return (_jsxs("div", { className: "flex h-[calc(100dvh-10rem)] flex-col md:h-[calc(100dvh-7.5rem)]", children: [_jsx(PageHeader, { title: "Assistente", subtitle: "Conversas, mem\u00F3ria cont\u00EDnua e a\u00E7\u00F5es diretas nos seus dados" }), _jsx(AssistantWorkspace, { mode: "page" })] }));
}

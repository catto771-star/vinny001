# Dependências — DS Lodge

## Produção
| Pacote | Versão | Uso |
|---|---|---|
| react / react-dom | ^18.3.1 | UI |
| react-router-dom | ^6.28.0 | Roteamento SPA |
| @supabase/supabase-js | ^2.45.4 | Auth, RPC, Realtime |
| lucide-react | ^0.468.0 | Ícones de linha |
| @fontsource/inter, ibm-plex-sans, ibm-plex-mono | ^5 | Fontes auto-hospedadas |

## Desenvolvimento
typescript ^5.6.3, vite ^5.4.11, @vitejs/plugin-react ^4.3.4, vitest ^2.1.8, jsdom ^25, @testing-library/react ^16.1 e dom ^10.4, pg ^8.13 (testes de banco), @types/*.

## Scripts npm
`dev`, `build` (tsc -b && vite build), `preview`, `typecheck`, `test` (vitest run), `test:unit`, `test:db`, `db:reset`, `demo:seed`, `demo:clear`.

## Infra externa
- **Supabase** (Postgres 16, Auth, Edge Functions Deno, Realtime) — única fonte de dados.
- **Vercel** — hospedagem estática com rewrite SPA e cabeçalhos de segurança (`vercel.json`: X-Frame-Options DENY, nosniff, Referrer-Policy same-origin).
- **Web Push** via Edge Function `send-push`; SMTP padrão do Supabase para código por e-mail (limite baixo).
- Playwright (pré-instalado no ambiente, fora do package.json) para e2e e manuais.

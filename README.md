# Curta

MicroSaaS em português (pt-BR) para criar vídeos explicativos animados de 30 ou 60 segundos a partir de um roteiro ou link de site, com narração e trilha sonora geradas por IA.

Este repositório contém o **app web Curta** (Next.js 14, App Router): a UI de marketing, autenticação, painel, assistente de novo projeto, página de créditos e a rota server-side de sugestão de roteiro. O roteiro de produção completo (Supabase, InfinitePay, Monid, render de vídeo via MiniMax + ffmpeg) está descrito em [`CURTA_BUILD_GUIDE.md`](./CURTA_BUILD_GUIDE.md).

## Status atual

| Parte | Estado |
|---|---|
| UI web (home, auth, painel, novo projeto, projetos, créditos) | Protótipo funcional, estado em `localStorage` |
| Sugestão de roteiro a partir de um link | **Implementado** — `POST /api/suggest` |
| Identidade visual (Fjalla One + Lora, paleta tally-light) | Pronta |
| Auth, persistência, créditos, pagamentos, geração de vídeo | Planejados — ver `CURTA_BUILD_GUIDE.md` |

A UI hoje roda como demonstração: login/registro, créditos e projetos são simulados no navegador (sem backend, sem cobrança, sem geração real de vídeo). A única dependência externa ativa é a geração de roteiro.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) — UI e rotas server
- [Vercel AI SDK](https://sdk.vercel.ai/) + `@ai-sdk/openai` — geração do roteiro
- [Cheaper Inference](https://cheaperinference.com/) (`deepseek-v4-flash`, OpenAI-compatible) — modelo do roteiro
- [Zod](https://zod.dev/) — schema validado do roteiro gerado
- TypeScript, ESLint (config do Next)

## Requisitos

- Node.js 18+
- Uma chave `CHEAPER_INFERENCE_API_KEY` (server-only) para a rota `/api/suggest`

## Começando

```bash
npm install
cp .env.example .env.local   # preencha CHEAPER_INFERENCE_API_KEY
npm run dev
```

Abra http://localhost:3000.

Para validar a sugestão de roteiro sem interface:

```bash
curl -X POST http://localhost:3000/api/suggest \
  -H "Content-Type: application/json" \
  -d '{"url":"https://exemplo.com","durationSeconds":30}'
```

Resposta esperada: `{ "ok": true, "titulo": "...", "cenas": ["...", "..."] }`.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção |
| `npm run lint` | ESLint (config Next) |
| `npm run typecheck` | `tsc --noEmit` |

## Estrutura

```
app/
  page.tsx            Home deslogada (marketing + preços)
  layout.tsx         Fontes (Fjalla One, Lora) + Providers + tema
  globals.css        Design tokens (paleta, escala tipográfica)
  criar-conta/       Cadastro (demo)
  entrar/            Login (demo)
  painel/            Home logada (demo)
  novo/              Assistente de 8 passos
  projetos/          Meus projetos (demo)
  creditos/          Comprar créditos (demo)
  api/suggest/route.ts  Sugestão de roteiro (real, server-side)
components/
  Canvas.tsx         Thumbnails de prévia
  Tape.tsx           Barra de topo
lib/
  ai/client.ts        Cliente Cheaper Inference (server-only)
  ai/generate-script.ts  Fetch da página + generateObject(zod)
  store.tsx           Estado de demo (localStorage) + toasts
  theme.ts            Alternância de tema
  types.ts            Tipos do projeto
  RequireAuth.tsx     Guarda de rota autenticada
curta.html            Protótipo estático original (referência de design/UX)
CURTA_BUILD_GUIDE.md  Guia de implementação da versão de produção
.env.example          Variáveis de ambiente (sem valores)
```

## Sugestão de roteiro (`/api/suggest`)

A rota recebe `{ url, durationSeconds }` (30 ou 60), busca a página da URL informada, extrai o texto visível e gera um roteiro em pt-BR com `generateObject` (AI SDK) contra o schema `{ titulo, cenas[] }` em `lib/ai/generate-script.ts`. Cada cena é uma sentença curta descrevendo uma ação visual — base para os clipes de vídeo no plano de produção.

Mapeamento de erros: URL inválida/vazia → `400`; site inalcançável → `502`; sem saldo/indisponível no provedor → `503`.

## Variáveis de ambiente

Veja [`.env.example`](./.env.example). Apenas `CHEAPER_INFERENCE_API_KEY` é exigida para o estado atual. As demais (`NEXT_PUBLIC_SUPABASE_*`, `MONID_API_KEY`, `INFINITEPAY_*`) são para o plano de produção em `CURTA_BUILD_GUIDE.md`.

## Plano de produção

O produto real (auth, créditos, pagamentos, geração de vídeo) mudará de `localStorage` para:

- **Supabase** — Postgres, Auth (`@supabase/ssr`), Storage, Edge Functions, `pg_cron` + `pg_net`
- **Monid** — geração de narração/trilha (ElevenLabs) e clipes de vídeo (MiniMax Hailuo-2.3)
- **ffmpeg** — concat dos clipes + mux de narração e trilha
- **InfinitePay** — Checkout + webhook (Edge Function) com crédito atômico via RPC `apply_purchase`

Detalhes completos, esquema do banco, RLS, pipeline de `render_jobs` e checklist de segurança: [`CURTA_BUILD_GUIDE.md`](./CURTA_BUILD_GUIDE.md).

## Licença

Uso interno. Direitos de fonte: Fjalla One e Lora (ambas Google Fonts, licença aberta/SIL OFL).
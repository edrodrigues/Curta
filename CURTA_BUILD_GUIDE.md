# Guia de implementação — Curta

Instruções para um agente de programação agêntica (Claude Code, Cursor, Devin, etc.) construir a versão real e produtiva do **Curta**, a partir do protótipo estático já validado (`curta.html`). Este documento assume que o agente tem acesso a: uma conta Vercel, uma conta Supabase, uma conta InfinitePay, e uma conta Monid com chave de API configurada.

> **Antes de tudo, três avisos importantes** que mudam decisões técnicas abaixo — leia esta seção antes de começar a codar.

## ⚠️ Pontos de atenção antes de implementar

1. **O nome correto do gateway é "InfinitePay", não "InfinityPay".** A empresa é a InfinitePay (grupo CloudWalk). Toda a documentação, variáveis de ambiente e URLs abaixo usam o nome correto — ajuste se você já criou algo com o nome errado.

2. **Os webhooks da InfinitePay, pela documentação pública disponível hoje, não têm um mecanismo de assinatura (HMAC) documentado.** Isso significa que, sem cuidado extra, qualquer pessoa poderia enviar um POST forjado para o seu endpoint de webhook (agora uma Supabase Edge Function) simulando um pagamento aprovado e ganhar créditos de graça. A seção 8 traz mitigações (URL com token secreto, validação de valor e `order_nsu`, idempotência). **Confirme com o time da InfinitePay (parcerias@cloudwalk.io ou a documentação da integração específica de checkout) qual é o mecanismo de verificação recomendado antes de ir para produção** — isso não foi possível confirmar publicamente nesta pesquisa.

3. **O protótipo usa as fontes Bahnschrift e Constantia (embutidas via data URI a partir de fontes do Windows).** Essas são fontes proprietárias da Microsoft — usá-las num produto comercial público **provavelmente viola a licença**, mesmo embutidas. Para produção, troque por fontes com licença aberta e visual equivalente (sugestões na seção 12) ou adquira licença comercial explícita antes do lançamento.

4. **Os vídeos são gerados como clipes de IA (cinemáticos), montados com ffmpeg — não tipografia cinética animada.** O protótipo (`curta.html`) renderiza cenas com tipografia em canvas, mas o produto real usa a Monid para gerar clipes de vídeo via **MiniMax Hailuo-2.3** (texto-para-vídeo). O roteiro é dividido em cenas (sentenças); cada cena vira um clipe de 6s ou 10s. Os clipes são concatenados com ffmpeg, e a narração (ElevenLabs) + trilha sonora (ElevenLabs Music) são muxeadas sobre o resultado. Não há Remotion neste produto — todo o audiovisual vem da Monid. Isso muda a identidade visual final (clipes de IA em vez de tipografia animada); a identidade de marca (paleta, tipografia da UI, cópias) continua valendo para o app web, não para o vídeo final.

---

## 1. Visão geral do produto

**Curta** — MicroSaaS em português (pt-BR) para criar vídeos explicativos animados de 30 ou 60 segundos, com roteiro opcionalmente sugerido a partir de um link de site, narração e trilha sonora geradas por IA (ElevenLabs, via Monid), clipes de vídeo gerados por IA (MiniMax Hailuo-2.3, via Monid), montagem final via ffmpeg, e cobrança por criação ou por pacote de créditos.

Páginas: Home (deslogada) → Cadastro/Login → Home logada (painel) → Assistente de novo projeto (8 passos: Link do site → Duração → Roteiro → Estilo de narração/trilha → Prévia de vídeo → Prévia de áudio → Gerar → Exportar) → Meus projetos → Comprar créditos.

O protótipo estático (`curta.html`) define a identidade visual, as cópias em português, e o fluxo completo — use-o como referência de design e UX do app web, não como base para o vídeo final (a renderização do vídeo mudou para clipes de IA via Monid; o protótipo simula tipografia em canvas porque rodava só no `localStorage`).

## 2. Stack técnica (Vercel + Supabase)

| Camada | Escolha |
|---|---|
| Framework | Next.js (App Router) |
| Hospedagem do app | Vercel |
| **Banco de dados** | **Supabase Postgres** |
| **Autenticação** | **Supabase Auth** (`@supabase/ssr` para SSR com cookies no Next.js) |
| **Armazenamento de arquivos (áudio/vídeo gerado)** | **Supabase Storage** (buckets privados, signed URLs) |
| **Cliente de dados** | **`@supabase/supabase-js`** (`@supabase/ssr` para o cliente server-side com cookies; cliente service-role server-only para operações privilegiadas) |
| **Esquema do banco** | **Declarative schemas** (`supabase/schemas/*.sql` — `supabase db diff` gera as migrations) |
| **Fila / processamento assíncrono** | **`pg_cron` + Supabase Edge Functions (Deno)** — uma função `poll-render-jobs` roda a cada ~20s via `pg_cron` e faz polling dos runs da Monid |
| **Webhook de pagamento** | **Supabase Edge Function** `infinitepay-webhook` |
| **Geração de vídeo** | **Monid → MiniMax Hailuo-2.3** (`minimax /v1/video_generation`); concatenação com ffmpeg |
| **Geração de narração** | **Monid → ElevenLabs** (`elevenlabs /text-to-speech`) |
| **Geração de trilha sonora** | **Monid → ElevenLabs Music** (`elevenlabs /v1/music`) |
| Inferência de IA (roteiro, resumo do link) | Vercel AI SDK + Cheaper Inference (provedor OpenAI-compatible, `@ai-sdk/openai`) |
| Pagamentos | InfinitePay Checkout + Webhooks (Edge Function) |

> A Vercel hospeda apenas o Next.js (UI + rotas que o usuário chama do navegador). Todo o estado, auth, arquivos, jobs e processamento assíncrono vivem no Supabase. O produto fica mais coeso e o limite de timeout das functions da Vercel deixa de ser um risco para o processamento de vídeo, que é completamente movido para fora das functions.

## 3. Modelo de dados

### 3.1 Tabelas

```
profiles                          -- substitui "users"; o auth fica no auth.users do Supabase
  id uuid primary key references auth.users(id) on delete cascade
  name text
  created_at timestamptz default now()

credit_wallets                    -- uma por usuário
  id uuid primary key default gen_random_uuid()
  user_id uuid not null references auth.users(id) on delete cascade
  balance integer not null default 0
  updated_at timestamltz default now()

credit_transactions               -- histórico imutável
  id uuid primary key default gen_random_uuid()
  user_id uuid not null references auth.users(id) on delete cascade
  delta integer not null               -- + ou -
  reason text not null                 -- 'signup_bonus' | 'purchase' | 'generation' | 'refund'
  related_order_nsu text               -- nullable
  created_at timestamltz default now()

credit_packages                   -- seed: bronze, prata, ouro
  id uuid primary key default gen_random_uuid()
  slug text not null unique            -- 'bronze' | 'prata' | 'ouro'
  credits integer not null
  price_cents integer not null
  is_featured boolean default false

orders
  id uuid primary key default gen_random_uuid()
  user_id uuid not null references auth.users(id) on delete cascade
  order_nsu text not null unique       -- gerado por nós antes do link de pagamento
  kind text not null                   -- 'package' | 'topup'
  package_slug text                    -- nullable
  amount_cents integer not null
  status text not null default 'pending'  -- 'pending' | 'paid' | 'failed'
  infinitepay_invoice_slug text        -- nullable
  created_at timestamltz default now()
  paid_at timestamltz                   -- nullable

projects
  id uuid primary key default gen_random_uuid()
  user_id uuid not null references auth.users(id) on delete cascade
  titulo text
  link_origem text                     -- nullable
  roteiro text not null
  duracao_segundos integer not null     -- 30 | 60
  estilo_narracao text
  estilo_trilha text
  status text not null default 'rascunho'  -- 'rascunho' | 'processando' | 'pronto' | 'erro'
  audio_url text                        -- nullable (path no Storage, não URL pública)
  video_url text                        -- nullable
  srt_url text                          -- nullable
  credits_charged integer
  created_at timestamltz default now()

render_jobs
  id uuid primary key default gen_random_uuid()
  project_id uuid not null references projects(id) on delete cascade
  kind text not null                    -- 'scene_clip' | 'narracao' | 'trilha'
  scene_index integer                   -- para kind 'scene_clip', qual cena (0-based)
  stage text not null                   -- 'pendente' | 'em_andamento' | 'concluido' | 'falhou'
  monid_run_id text                     -- nullable
  provider text                         -- 'minimax' | 'elevenlabs'
  endpoint text                          -- '/v1/video_generation' | '/text-to-speech' | '/v1/music'
  input jsonb                           -- snapshot do payload enviado
  output jsonb                           -- resposta final (links, custos, metadados)
  error_message text
  created_at timestamltz default now()
  updated_at timestamltz default now()
```

### 3.2 Trigger de cadastro — bônus atômico de 2 créditos

Um trigger em `auth.users INSERT` cria automaticamente o `profiles`, a `credit_wallets` com `balance = 2`, e a `credit_transactions` (delta +2, reason `signup_bonus`). Tudo numa transação atômica dentro do banco — a aplicação nunca precisa creditar o bônus, e não há como bypassar. Exemplo de schema declarativo em `supabase/schemas/`:

```sql
-- supabase/schemas/profiles.sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

create table public.credit_wallets ( ... );
create table public.credit_transactions ( ... );

-- função do trigger (SECURITY INVOKER, schema não-exposto)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  insert into public.credit_wallets (user_id, balance) values (new.id, 2);
  insert into public.credit_transactions (user_id, delta, reason)
    values (new.id, 2, 'signup_bonus');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

> Use `SECURITY INVOKER` (não `SECURITY DEFINER`). A função roda como o usuário que criou a conta via Auth; como é um trigger em `auth.users`, é invocada pelo papel interno do Supabase Auth e tem as permissões necessárias. Mantenha-a no schema `private` (não-exposto pela Data API).

### 3.3 Crédito atômico de compra — RPC `private.apply_purchase`

O webhook da InfinitePay credita a carteira + registra a transação numa única operação via uma RPC `SECURITY INVOKER` no schema `private`, chamada por `supabase.rpc('apply_purchase', { p_order_nsu })` com o cliente **service_role**. A função: localiza o `order`, rejeita se já `paid` (idempotência), valida que o valor bate, atualiza `orders.status = 'paid'`, incrementa `credit_wallets.balance`, insere `credit_transactions`. Nada disso é RLS — a RPC roda com privilégios do service_role.

### 3.4 RLS — políticas por tabela

Habilitar `row level security` em **toda** tabela de `public`. Políticas (modelo, adaptar por tabela):

```sql
-- SELECT / UPDATE / DELETE: dono vê só as próprias linhas
create policy "owner_select" on public.projects
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "owner_update" on public.projects
  for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "owner_delete" on public.projects
  for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- INSERT: dono só cria linhas suas
create policy "owner_insert" on public.projects
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );
```

Observações de segurança do Supabase (obrigatório — ver checklist da seção 13):
- Nunca use só `TO authenticated` sem predicado de owner — vira BOLA/IDOR.
- Políticas `UPDATE` exigem `USING` **e** `WITH CHECK` (senão o usuário reatribui `user_id`).
- `auth.role()` está depreciado — use a cláusula `TO`.
- `credit_transactions` e `orders` são escritas pelo servidor via service_role (bypassam RLS); mantenha RLS como defesa em profundidade (SELECT owner-only).
- `credit_packages` é leitura pública: `for select to anon, authenticated using (true)`.

## 4. Variáveis de ambiente

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=          # publishable key exposto no browser
SUPABASE_SERVICE_ROLE_KEY=               # server-only, nunca NEXT_PUBLIC_

# Storage
SUPABASE_STORAGE_BUCKET_AUDIO=audio
SUPABASE_STORAGE_BUCKET_VIDEO=video
SUPABASE_STORAGE_BUCKET_SRT=srt

# Cheaper Inference (roteiro/LLM)
CHEAPER_INFERENCE_API_KEY=               # ir_live_..., server-only

# Monid
MONID_API_KEY=                           # server-only

# InfinitePay
INFINITEPAY_HANDLE=                      # seu InfiniteTag, sem o $
INFINITEPAY_WEBHOOK_SECRET=              # token aleatório definido por você (seção 8)

# App
NEXT_PUBLIC_APP_URL=
```

Crie `.env.example` com chaves vazias e commite-o (NUNCA `.env.local`). Regras:
- Nunca exponha `MONID_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INFINITEPAY_WEBHOOK_SECRET` nem `CHEAPER_INFERENCE_API_KEY` no cliente — só em API routes / Edge Functions / `lib/supabase/admin.ts` / `lib/ai/client.ts`.
- Variáveis `NEXT_PUBLIC_*` são públicas (vão ao navegador): só `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 5. Sistema de créditos e preços

Manter exatamente a lógica do protótipo:

- 1 crédito = R$ 25,00 de valor de referência.
- Vídeo de 30s: 1 crédito (promoção; preço cheio é 2 créditos / R$ 50).
- Vídeo de 60s: 2 créditos (R$ 50, preço cheio).
- Bônus de cadastro: 2 créditos grátis (via trigger da seção 3.2).
- Pacotes: Bronze (5 créditos / R$ 110), Prata (10 créditos / R$ 210, "mais popular"), Ouro (20 créditos / R$ 380).

Débito de créditos só deve acontecer **depois** que a geração é confirmada como iniciada com sucesso (evite debitar e depois falhar a geração sem estornar). Recomendação: reserve os créditos ao disparar os `render_jobs` e confirme/estorne no fim.

### 5.1 Custo aproximado por vídeo (referência de margem)

Custos da Monid observados em agosto de 2026 (confirme com `monid inspect` antes de ir a produção — mudam):

| Item | Endpoint | Custo | 30s | 60s |
|---|---|---|---|---|
| Clipe de vídeo | `minimax /v1/video_generation` 768P/6s — $0.28 | $0.28 cada | 5 clipes = $1.40 | 10 clipes = $2.80 |
| Narração | `elevenlabs /text-to-speech` ~$0.05–0.10 /1K chars | ~$0.05 | ~$0.05 | ~$0.09 |
| Trilha | `elevenlabs /v1/music` $0.15/min (prorata) | $0.075 | $0.075 | $0.15 |
| **Total Monid/vídeo** | | | **~$1.53** | **~$3.04** |

Receita: 30s = 1 crédito = R$ 25 (~$4.50) → margem ~$3; 60s = 2 créditos = R$ 50 (~$9) → margem ~$6. **A margem é positiva mas apertada** —.seed de pacotes mantém o fluxo de caixa saudável. Valide os custos com `monid balance` e `monid inspect` antes de escalar.

## 6. Pagamentos — InfinitePay

### Criar um link de pagamento

```
POST https://api.checkout.infinitepay.io/links
Content-Type: application/json

{
  "handle": "<INFINITEPAY_HANDLE>",
  "redirect_url": "https://seuapp.com/comprar/sucesso",
  "order_nsu": "<id único gerado por você para o pedido>",
  "items": [
    { "quantity": 1, "price": 21000, "description": "Pacote Prata — 10 créditos" }
  ],
  "webhook_url": "https://<seu-projeto>.functions.supabase.co/infinitepay-webhook/<token-secreto>",
  "customer": { "name": "...", "email": "...", "phone_number": "..." }
}
```

- `price` é em **centavos**.
- Gere o `order_nsu` no banco (linha `orders`, status `pending`) **antes** de chamar a API, via `INSERT` server-side com o cliente service-role.
- O `webhook_url` aponta para a Edge Function `infinitepay-webhook` do Supabase (não para uma rota do Next.js). O token secreto vai no path — ver seção 8.

### Receber o webhook (Edge Function Supabase)

Payload confirmado publicamente inclui: `invoice_slug`, `amount`, `paid_amount`, `installments`, `capture_method`, `transaction_nsu`, `order_nsu`, `receipt_url`, `items`.

```ts
// supabase/functions/infinitepay-webhook/index.ts (Deno)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token !== Deno.env.get("INFINITEPAY_WEBHOOK_SECRET")) {
    return Response.json({ success: false, message: "unauthorized" }, { status: 400 });
  }
  const body = await req.json();
  const supabase = createClient(
    Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Idempotência + validação de valor + crédito atômico numa única RPC
  const { data, error } = await supabase.rpc("apply_purchase", {
    p_order_nsu: body.order_nsu,
    p_paid_amount: body.paid_amount,
    p_invoice_slug: body.invoice_slug,
  });
  if (error) return Response.json({ success: false, message: error.message }, { status: 400 });
  if (!data?.ok) return Response.json({ success: false, message: data?.message ?? "rejected" }, { status: 400 });

  return Response.json({ success: true, message: null }); // responder em <1s
});
```

A RPC `apply_purchase` (seção 3.3) encapsula: rejeita se pedido não existe, rejeita se já `paid` (idempotência), valida `paid_amount === orders.amount_cents`, atualiza `orders.status='paid'`+`paid_at`, incrementa `credit_wallets.balance`, insere `credit_transactions`. Responda em **menos de 1 segundo** com `200 {"success": true, "message": null}` (sucesso) ou `400 {"success": false, "message": "..."}` (erro) — é o contrato documentado pela InfinitePay.

> Antes de lançar: confirme com a InfinitePay se existe um endpoint de consulta server-to-server do status da transação (para reconciliar em caso de dúvida sobre a autenticidade do webhook) — não encontramos essa informação publicamente.

## 7. Narração e trilha sonora — Monid → ElevenLabs

API REST da Monid (capturada via `monid discover` / `monid inspect`, agosto de 2026):

```
Base: https://api.monid.ai/v1
Auth: Authorization: Bearer <MONID_API_KEY>

POST /v1/discover    { "query": "...", "limit": 5 }
POST /v1/inspect     { "provider": "...", "endpoint": "..." }
POST /v1/run         { "provider": "...", "endpoint": "...", "input": {...} }
POST /v1/runs        { ...status de um run assíncrono... }
```

Endpoints confirmados (rode `monid discover` / `monid inspect` para conferir schema vigente antes de codar):

| Tipo | Provider | Endpoint | Preço |
|---|---|---|---|
| Narração | `elevenlabs` | `/text-to-speech` | $0.05–0.10 /1K chars |
| Trilha | `elevenlabs` | `/v1/music` | $0.15 /min (prorata) |
| Clipes de vídeo | `minimax` | `/v1/video_generation` | $0.28–$0.56 /clipe |
| Listar vozes | `elevenlabs` | `/voices` | $0 |

### Schema de input (resumo)

**ElevenLabs `/text-to-speech`:** `{ "text": "...", "model_id": "eleven_multilingual_v2" | "eleven_flash_v2_5" | "eleven_v3", "voice_id": "<de /voices>", "voice_settings": { "stability": 0.5, ... } }`. Saída: objeto `audio` com `download_link` (signed), `content_type`, `character_count` (billado). Texto 1–5000 chars; divida roteiros maiores em runs.

**ElevenLabs `/v1/music`:** `{ "prompt": "descrição: gênero, mood, instrumentação, vocais", "music_length_ms": 30000, "model_id": "music_v1" | "music_v2" }`. `music_length_ms` 3000–300000; **é a base de cobrança**. Geração demora alguns minutos — tem timeout estendido.

Passos para o agente (fazer **uma vez** antes de codar, localmente):

1. `monid discover -q "elevenlabs text to speech"` → confirmar provider/endpoint atuais.
2. `monid inspect --provider elevenlabs --endpoint /text-to-speech` → capturar `voice_id`s pt-BR adequados e o schema de `voice_settings`.
3. `monid inspect --provider elevenlabs --endpoint /v1/music` para confirmar o schema da trilha.
4. No código, **não** dependa do binário `monid` dentro das Edge Functions (não há install global em runtime Deno) — chame a API REST com `fetch()` diretamente.
5. Trate como assíncrono: dispare o `run`, salve `monid_run_id` em `render_jobs`, faça polling via `pg_cron` → Edge Function `poll-render-jobs` (seção 11).
6. Endpoints da Monid (especialmente os baseados em Apify) cobram por resultado — peça poucos itens e confirme custo com `monid inspect`/`monid balance` antes de ir a produção.

## 8. Geração e montagem do vídeo — Monid MiniMax + ffmpeg

A renderização do vídeo é feita inteiramente via Monid → **MiniMax Hailuo-2.3** (`minimax /v1/video_generation`, texto-para-vídeo). Não há Remotion nem composição programática em React. Fluxo:

### 8.1 MiniMax — clipes por cena

**Endpoint:** `minimax /v1/video_generation`. Schema de input:

```jsonc
{
  "model": "MiniMax-Hailuo-2.3",     // fixo
  "prompt": "string 1–2000 chars. Suporta [Push in], [Pan left], [Zoom out].",
  "resolution": "768P",              // "768P" ou "1080P"
  "duration": 6,                     // 6 ou 10 (segundos, em 768P)
  "prompt_optimizer": true,
  "fast_pretreatment": false
  // para image-to-video: "first_frame_image": "<url ou data:image jpeg base64>"
}
```

- **6s ou 10s por clipe** (em 768P). Para 30s: 5×6s = $1.40 ou 3×10s = $1.68; para 60s: 10×6s = $2.80 ou 6×10s = $3.36. Prefira 6s para resolução mais barata por segundo, se o pacing permitir.
- Algoritmo sugerido: divida o roteiro em cenas (uma por sentença), gere um `prompt` de cena em inglês curto + descritivo a partir de cada sentença do roteiro (via Vercel AI SDK), dispare um `run` Monid por cena, salve cada um em `render_jobs` (`kind='scene_clip'`, `scene_index` N).
- Os clipes são **cinemáticos genéricos** — não têm tipografia, legendas nem narração embutida. Tudo é muxeado depois.

### 8.2 Montagem final (ffmpeg)

Quando todos os `render_jobs` de um projeto estão `concluido`, a Edge Function `poll-render-jobs` baixa os clipes e os concatena:

```bash
# 1. concat dos clipes (na ordem de scene_index)
printf "file 'clip_0.mp4'\nfile 'clip_1.mp4\n..." > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy video_body.mp4

# 2. mux narração + trilha (narração na frente, trilha com volume reduzido)
ffmpeg -i video_body.mp4 -i narracao.mp3 -i trilha.mp3 \
  -filter_complex "[2:a]volume=0.25[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -shortest final.mp4
```

- A duração do vídeo final = soma das durações dos clipes (30s ou 60s conforme a escolha). Corta/trata o áudio de narração para casar com a duração total (se a narração for mais curta, completa com trilha; se for mais longa, ajuste o pacing dos clipes).
- Suba o `.mp4` final para o bucket `video` do Supabase Storage; a narração em `audio`; gere o `.srt` a partir das sentenças distribuídas pelas durações dos clipes e suba em `srt`.
- Atualize `projects.status = 'pronto'` + os campos `audio_url`/`video_url`/`srt_url` (paths no Storage, não URLs públicas).

### 8.3 Pipeline de stages dos `render_jobs`

```
1. kind='narracao'     → ElevenLabs /text-to-speech (1 run, roteiro inteiro)
2. kind='trilha'       → ElevenLabs /v1/music (1 run, duração do projeto)
3. kind='scene_clip'   → MiniMax /v1/video_generation (1 run por cena, em paralelo)
4. poll-render-jobs (pg_cron a cada 20s) → quando TODOS concluidos:
   → baixa clipes, ffmpeg concat + mux, upload Storage, projects.status='pronto'
   → debita/confirma créditos (seção 5)
```

## 9. Estrutura de páginas e fluxo

Reaproveitar 1:1 do protótipo (`curta.html`) para o app web:

- `/` — Home deslogada (marketing, preços, como funciona)
- `/entrar`, `/criar-conta` — **Supabase Auth** via `@supabase/ssr` (`signInWithPassword` / `signUp`)
- `/painel` — Home logada (lê `projects` do banco, respeitando RLS)
- `/novo` — Assistente de 8 passos: Link do site → Duração → Roteiro → Estilo de narração e trilha → Prévia de vídeo → Prévia de áudio → Gerar → Exportar
- `/projetos` — Meus projetos
- `/creditos` — Comprar créditos (gera o link de pagamento InfinitePay, seção 6)

No passo "Link do site", a sugestão de roteiro no protótipo é simulada; na versão real, use o Vercel AI SDK para: (a) buscar o conteúdo da página (fetch + extração de texto), (b) gerar um roteiro sugerido em pt-BR com um modelo via **Cheaper Inference** (provedor OpenAI-compatible; base URL `https://api.cheaperinference.com/v1`; chave `CHEAPER_INFERENCE_API_KEY`; modelo `deepseek-v4-flash`; `generateObject` com zod schema `{ titulo, cenas[] }` e `providerOptions.openai.strictJsonSchema = true`), respeitando o limite de palavras da duração escolhida, e dividir em cenas (uma por sentença) — que vão virar prompts do MiniMax na seção 8. Implementação de referência em `lib/ai/client.ts` + `lib/ai/generate-script.ts`, exposta pela rota server `app/api/suggest/route.ts`.

## 10. Identidade visual

Paleta e tipografia do protótipo (reaproveitar na UI do app web):

- Cores: ink `#1b1620`, paper `#ede6d9`, accent (vermelho tally-light) `#d8434c`, amber `#e4a83c`, plum `#372c42`, success `#3fa173`.
- Tipografia: display condensado estilo sinalização (protótipo usa Bahnschrift), corpo serifado humanista (protótipo usa Constantia), utilitário monoespaçado para números/preços.
- **Para produção, troque Bahnschrift → algo como Archivo Narrow, Big Shoulders, ou Fjalla One (Google Fonts, licença aberta), e Constantia → Source Serif 4, Lora, ou Spectral (Google Fonts).**

> Nota: a identidade visual acima vale para o **app web**. O **vídeo final** (saída da Monid + ffmpeg) é cinematic AI — a tipografia/legendas não aparecem sobre os clipes por padrão. Se quiser legendas sobre os clipes, gere `.srt` (seção 8.2) e/ou queime legendas via `ffmpeg` na montagem final.

## 11. Processamento assíncrono — `pg_cron` + Edge Functions

Substitui o Vercel Cron das versões anteriores. Tudo no Supabase:

1. **Edge Function `start-render`** — chamada pelo Next.js quando o usuário confirma "Gerar". Cria a linha em `projects` (status `processando`), dispara os `monid /v1/run` para narração, trilha e um por cena (via `fetch` à API REST da Monid com `MONID_API_KEY`), salva cada um em `render_jobs`.

2. **`pg_cron` schedule** — registre um job que chama a Edge Function `poll-render-jobs` a cada 20 segundos:

```sql
-- dentro do Supabase (SQL editor / migration)
select cron.schedule(
  'poll-render-jobs',
  '*/20 seconds',
  $$ select net.http_post(
    url := 'https://<projeto>.functions.supabase.co/poll-render-jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_token', true)
    ),
    body := '{}'::jsonb
  ) $$
);
```

   `pg_cron` + `pg_net` (extensão) fazem o POST server-to-server. A função `poll-render-jobs` usa o cliente service-role, busca `render_jobs` em `em_andamento`, chama `POST /v1/runs` da Monid por cada `monid_run_id`, atualiza status. Quando todos os de um projeto estão `concluido`, executa a montagem ffmpeg (seção 8.2) e atualiza `projects`.

> Montagem ffmpeg: ela consome CPU/tempo. Edge Functions Deno têm limites — se a montagem for muito longa (vários clipes, mux pesado), considere: (a) manter a montagem como uma function separada `assemble-video` invocada uma vez ao fim, ou (b) rodar a montagem num pequeno worker (ex.: uma Vercel function dedicada, já que o app vive na Vercel). A escolha depende do volume; a arquitetura acima é o ponto de partida.

## 12. Ordem sugerida de implementação

1. **`supabase init`** + `config.toml` com `schema_paths = ["schemas"]` + `supabase link --project-ref <ref>`. Criar `.mcp.json` apontando para `https://mcp.supabase.com/mcp` e fazer OAuth (habilita `search_docs`/`execute_sql`/`get_advisors` no agente).
2. **Discovery Monid** (local, uma vez): `monid discover -q "elevenlabs text to speech"`, `monid discover -q "video generation"`, `monid discover -q "background music"`, e `monid inspect` em cada endpoint — capturar `voice_id`s, schemas de input e custos vigentes.
3. **Esquema declarativo** em `supabase/schemas/*.sql` (perfis, carteiras, transações, pacotes seed, orders, projects, render_jobs) + trigger de bônus + RPC `apply_purchase` → `supabase db diff <name> --local` → `supabase db advisors` → fixar → commit migration.
4. **`.env.local`** + `.env.example` (variáveis da seção 4). Confirmar que `.gitignore` cobre `.env.local`.
5. **`npm i @supabase/supabase-js @supabase/ssr`** (pinne versões exatas, commite lockfile). Criar `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`.
6. **Storage buckets** `audio`/`video`/`srt` (privados) + políticas RLS de Storage (owner; INSERT+SELECT+UPDATE para upsert).
7. **Supabase Auth**: `/entrar`, `/criar-conta` com `@supabase/ssr` (cookies). Bônus de 2 créditos é automático pelo trigger (nada no app). Teste cadastro → `profiles` + `balance=2` criados.
8. **RLS policies** em todas as tabelas `public` (seção 3.4). Rodar `supabase db advisors` de novo.
9. **Home deslogada e painel logado** (estático, lendo dados reais com o cliente server-side).
10. **InfinitePay**: rota server-side que cria o `order` no banco + link de pagamento; Edge Function `infinitepay-webhook` + RPC `apply_purchase`. Teste sandbox se disponível; replay idempotente.
11. **Assistente de novo projeto** (8 passos de UI, salvando `projects` como rascunho, sem geração real ainda).
12. **Edge Function `start-render`** + `poll-render-jobs` (pg_cron). Disparar runs Monid para narração, trilha e clipes por cena.
13. **Montagem ffmpeg** (seção 8.2) na `poll-render-jobs` ao final + upload Storage + `.srt` + `projects.status='pronto'`.
14. **Página "Meus projetos"** com dados reais + player de vídeo (signed URL do Storage).
15. **Ajustes de identidade visual** final (fontes licenciadas, seção 10).
16. **Checklist de segurança** (seção 13) antes do go-live.

## 13. Checklist de segurança antes do go-live

### Geral
- [ ] Nenhuma chave (`MONID_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INFINITEPAY_WEBHOOK_SECRET`, `CHEAPER_INFERENCE_API_KEY`) em código client-side ou variáveis `NEXT_PUBLIC_*`.
- [ ] Webhook da InfinitePay usa token secreto na URL (query) e valida `paid_amount` contra o antes de creditar (via RPC `apply_purchase`).
- [ ] Webhook é idempotente (reprocessar o mesmo evento não credita duas vezes) — a RPC rejeita se `orders.status` já `paid`.
- [ ] Débito de créditos só após o pedido de geração aceito; falhas geram estorno automático.
- [ ] Limites conservadores nas chamadas Monid (poucos resultados, confirmação de custo via `monid balance`/`inspect`).
- [ ] Fontes de produção têm licença aberta ou licenciada comercialmente.
- [ ] Rate limiting básico nas rotas de geração e nos webhooks públicos.

### Supabase (do skill Supabase)
- [ ] Nunca exponha `service_role` / secret key no cliente — só publishable key (`anon`) em `NEXT_PUBLIC_*`.
- [ ] Nunca use `user_metadata` (JWT editável pelo usuário) em decisões de autorização — use `app_metadata`.
- [ ] RLS habilitada em **toda** tabela de `public`.
- [ ] Políticas usam `TO authenticated` **+** predicado de owner (`(select auth.uid()) = user_id`); nunca `TO authenticated` sozinho (BOLA/IDOR).
- [ ] Políticas `UPDATE` têm `USING` **e** `WITH CHECK`.
- [ ] Não use `auth.role()` (depreciado) — use a cláusula `TO`.
- [ ] `SECURITY DEFINER` só em schema não-exposto (`private`); inclua checagem de owner no corpo. Prefira `SECURITY INVOKER` quando possível.
- [ ] Views são `security_invoker = true` (Postgres 15+) ou têm acesso revogado de `anon`/`authenticated`.
- [ ] Storage upsert requer INSERT + SELECT + UPDATE — garanta os três onde houver substituição de arquivo.
- [ ] Pinne versões dos pacotes Supabase e commite o lockfile (`package-lock.json`).
- [ ] `supabase db advisors` limpo antes do go-live.

## 14. Setup Supabase — how-to rápido

```bash
# 1. CLI (≥ v2.81.3 para db advisors)
brew install supabase/tap/supabase          # ou: npm i -g supabase
supabase --version

# 2. init + link (na raiz do repo)
supabase init                                # cria supabase/ + config.toml
supabase link --project-ref <ref>            # ref do dashboard Supabase

# 3. declarative schemas
# em config.toml: schema_paths = [ "schemas" ]
# escreva supabase/schemas/*.sql com as tabelas (seção 3)

# 4. gerar migration a partir do schema declarativo
supabase db diff <nome-descritivo> --local --yes
supabase db advisors                          # corrige avisos
supabase migration list --local

# 5. Edge Functions
supabase functions new infinitepay-webhook
supabase functions new start-render
supabase functions new poll-render-jobs
supabase functions deploy infinitepay-webhook --no-verify-jwt

# 6. Storage buckets (SQL editor ou CLI)
# create bucket audio, video, srt (private); políticas RLS de Storage

# 7. pg_cron
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- agende poll-render-jobs (seção 11)
```

`.mcp.json` na raiz (permite ao agente usar `search_docs`/`execute_sql`/`get_advisors`):

```json
{
  "mcpServers": {
    "supabase": { "url": "https://mcp.supabase.com/mcp" }
  }
}
```

Na primeira chamada o agente dispara OAuth — complete no navegador e recarregue a sessão.

## Fontes consultadas (agosto de 2026)

- [Monid — Introduction](https://docs.monid.ai/)
- [Monid — For AI Agents (Skill)](https://docs.monid.ai/guide/quickstart-skill.html)
- [InfinitePay — Desenvolvedores](https://www.infinitepay.io/desenvolvedores)
- [Central de Ajuda InfinitePay — Checkout Integrado](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-da-infinitepay)
- [Supabase Docs](https://supabase.com/docs) — Auth, Storage, pg_cron, declarative schemas, Edge Functions
- [Supabase — Exposing a Table to the Data API](https://supabase.com/docs/guides/api/securing-your-api.md)
- [Supabase — Declarative database schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas)

Endpoints Monid confirmados via `monid discover`/`monid inspect`: `minimax /v1/video_generation`, `elevenlabs /text-to-speech`, `elevenlabs /v1/music`, `elevenlabs /voices`. Os detalhes de webhook/API refletem o que estava publicamente documentado nesse momento — confirme diretamente com cada provedor antes de codar contra eles em produção, especialmente o mecanismo de verificação de autenticidade do webhook da InfinitePay (não documentado publicamente).
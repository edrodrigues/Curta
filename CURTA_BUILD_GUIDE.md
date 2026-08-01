# Guia de implementação — Curta

Instruções para um agente de programação agêntica (Claude Code, Cursor, Devin, etc.) construir a versão real e produtiva do **Curta**, a partir do protótipo estático já validado (`curta.html`). Este documento assume que o agente tem acesso a: uma conta Vercel, uma conta InfinitePay, e uma conta Monid com chave de API configurada.

> **Antes de tudo, três avisos importantes** que mudam decisões técnicas abaixo — leia esta seção antes de começar a codar.

## ⚠️ Pontos de atenção antes de implementar

1. **O nome correto do gateway é "InfinitePay", não "InfinityPay".** A empresa é a InfinitePay (grupo CloudWalk). Toda a documentação, variáveis de ambiente e URLs abaixo usam o nome correto — ajuste se você já criou algo com o nome errado.

2. **Os webhooks da InfinitePay, pela documentação pública disponível hoje, não têm um mecanismo de assinatura (HMAC) documentado.** Isso significa que, sem cuidado extra, qualquer pessoa poderia enviar um POST forjado para o seu endpoint de webhook simulando um pagamento aprovado e ganhar créditos de graça. A seção 8 traz mitigações (URL com token secreto, validação de valor e `order_nsu`, idempotência). **Confirme com o time da InfinitePay (parcerias@cloudwalk.io ou a documentação da integração específica de checkout) qual é o mecanismo de verificação recomendado antes de ir para produção** — isso não foi possível confirmar publicamente nesta pesquisa.

3. **O protótipo usa as fontes Bahnschrift e Constantia (embutidas via data URI a partir de fontes do Windows).** Essas são fontes proprietárias da Microsoft — usá-las num produto comercial público **provavelmente viola a licença**, mesmo embutidas. Para produção, troque por fontes com licença aberta e visual equivalente (sugestões na seção 12) ou adquira licença comercial explícita antes do lançamento.

---

## 1. Visão geral do produto

**Curta** — MicroSaaS em português (pt-BR) para criar vídeos explicativos animados de 30 ou 60 segundos, com roteiro opcionalmente sugerido a partir de um link de site, narração e trilha sonora geradas por IA (ElevenLabs, via Monid), e cobrança por criação ou por pacote de créditos.

Páginas: Home (deslogada) → Cadastro/Login → Home logada (painel) → Assistente de novo projeto (8 passos: Link do site → Duração → Roteiro → Estilo de narração/trilha → Prévia de vídeo → Prévia de áudio → Gerar → Exportar) → Meus projetos → Comprar créditos.

O protótipo estático (`curta.html`) já define a identidade visual, as cópias em português, e o fluxo completo — use-o como referência de design e UX, não como código a ser reaproveitado linha a linha (ele simula tudo no `localStorage`; o produto real precisa de backend).

## 2. Stack técnica (Vercel)

| Camada | Escolha recomendada |
|---|---|
| Framework | Next.js (App Router) |
| Hospedagem | Vercel |
| Banco de dados | Vercel Postgres (Neon) |
| ORM | Drizzle ou Prisma |
| Armazenamento de arquivos (áudio/vídeo gerado) | Vercel Blob |
| Autenticação | Auth.js (NextAuth) com provider de e-mail/senha ou magic link |
| Fila / processamento assíncrono | Vercel Cron + tabela de jobs (seção 10), ou Inngest/Trigger.dev se preferir uma fila gerenciada |
| Renderização de vídeo | Remotion (ver seção 10) |
| Inferência de IA (roteiro, resumo do link) | Vercel AI SDK + Vercel AI Gateway |
| Narração e trilha sonora | Monid → ElevenLabs (seção 9) |
| Pagamentos | InfinitePay Checkout + Webhooks (seção 8) |

> Confirme com o agente qual plano Vercel será usado — a renderização de vídeo pode ultrapassar o timeout padrão de function (10–60s no plano padrão). Funções com Fluid Compute chegam a 300s+; para renders mais longos, mova a renderização para um worker externo (ex.: Remotion Lambda na AWS, chamado a partir da function da Vercel) em vez de rodar dentro da própria function.

## 3. Modelo de dados

```
users
  id, email, password_hash (ou provider_id), name, created_at

credit_wallets
  id, user_id, balance (integer, em créditos), updated_at

credit_transactions
  id, user_id, delta (+/-), reason ('signup_bonus' | 'purchase' | 'generation' | 'refund'),
  related_order_nsu (nullable), created_at

credit_packages
  id, slug ('bronze' | 'prata' | 'ouro'), credits, price_cents, is_featured

orders
  id, user_id, order_nsu (único, gerado por nós), kind ('package' | 'topup'),
  package_slug (nullable), amount_cents, status ('pending' | 'paid' | 'failed'),
  infinitepay_invoice_slug (nullable), created_at, paid_at

projects
  id, user_id, titulo, link_origem (nullable), roteiro, duracao_segundos (30|60),
  estilo_narracao, estilo_trilha, status ('rascunho' | 'processando' | 'pronto' | 'erro'),
  audio_url (nullable), video_url (nullable), srt_url (nullable),
  credits_charged, created_at

render_jobs
  id, project_id, stage ('narracao' | 'trilha' | 'render' | 'finalizado'),
  status ('pendente' | 'em_andamento' | 'concluido' | 'falhou'),
  monid_run_id (nullable), error_message (nullable), created_at, updated_at
```

## 4. Variáveis de ambiente

```
DATABASE_URL=
AUTH_SECRET=
MONID_API_KEY=
INFINITEPAY_HANDLE=            # seu InfiniteTag, sem o $
INFINITEPAY_WEBHOOK_SECRET=     # token aleatório definido por você, não pela InfinitePay — ver seção 8
BLOB_READ_WRITE_TOKEN=          # Vercel Blob
NEXT_PUBLIC_APP_URL=
```

Nunca exponha `MONID_API_KEY` nem qualquer segredo da InfinitePay no cliente — todas as chamadas passam por API routes server-side (`app/api/**`), nunca por código que roda no navegador.

## 5. Sistema de créditos e preços

Manter exatamente a lógica do protótipo:

- 1 crédito = R$ 25,00 de valor de referência.
- Vídeo de 30s: 1 crédito (promoção; preço cheio é 2 créditos / R$ 50).
- Vídeo de 60s: 2 créditos (R$ 50, preço cheio).
- Bônus de cadastro: 2 créditos grátis.
- Pacotes: Bronze (5 créditos / R$ 110), Prata (10 créditos / R$ 210, "mais popular"), Ouro (20 créditos / R$ 380).

Débito de créditos só deve acontecer **depois** que a geração é confirmada como iniciada com sucesso (evite debitar e depois falhar a geração sem estornar).

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
  "webhook_url": "https://seuapp.com/api/webhooks/infinitepay/<token-secreto>",
  "customer": { "name": "...", "email": "...", "phone_number": "..." }
}
```

- `price` é em **centavos**.
- Gere o `order_nsu` no seu banco (linha `orders`, status `pending`) **antes** de chamar a API, e use esse mesmo id na chamada.
- O `webhook_url` deve conter um token secreto imprevisível no path (armazenado em `INFINITEPAY_WEBHOOK_SECRET` ou por pedido) — como não há assinatura HMAC documentada publicamente, esse token é sua principal defesa contra chamadas forjadas. Rejeite qualquer request nesse endpoint cujo token não bata.

### Receber o webhook

Payload confirmado publicamente inclui: `invoice_slug`, `amount`, `paid_amount`, `installments`, `capture_method`, `transaction_nsu`, `order_nsu`, `receipt_url`, `items`.

```ts
// app/api/webhooks/infinitepay/[token]/route.ts
export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (params.token !== process.env.INFINITEPAY_WEBHOOK_SECRET) {
    return Response.json({ success: false, message: "unauthorized" }, { status: 400 });
  }
  const body = await req.json();
  const order = await db.orders.findUnique({ where: { order_nsu: body.order_nsu } });
  if (!order) return Response.json({ success: false, message: "order not found" }, { status: 400 });
  if (order.status === "paid") {
    // idempotência: já processado, apenas confirme 200
    return Response.json({ success: true, message: null });
  }
  if (body.paid_amount !== order.amount_cents) {
    return Response.json({ success: false, message: "amount mismatch" }, { status: 400 });
  }
  await db.transaction(async (tx) => {
    await tx.orders.update({ where: { id: order.id }, data: { status: "paid", paid_at: new Date(), infinitepay_invoice_slug: body.invoice_slug } });
    await tx.credit_wallets.increment({ user_id: order.user_id, by: creditsForOrder(order) });
    await tx.credit_transactions.create({ user_id: order.user_id, delta: creditsForOrder(order), reason: "purchase", related_order_nsu: order.order_nsu });
  });
  return Response.json({ success: true, message: null }); // responder em menos de 1s
}
```

Responda em **menos de 1 segundo** com `200 {"success": true, "message": null}` (sucesso) ou `400 {"success": false, "message": "..."}` (erro) — é o contrato documentado pela InfinitePay. Se a confirmação de crédito exigir trabalho mais lento, credite de forma otimista e reconcilie depois via job assíncrono, mas sempre responda rápido.

> Antes de lançar: confirme com a InfinitePay se existe um endpoint de consulta server-to-server do status da transação (para reconciliar em caso de dúvida sobre a autenticidade do webhook) — não encontramos essa informação publicamente.

## 7. Narração e trilha sonora — Monid + ElevenLabs

API REST confirmada:

```
Base: https://api.monid.ai/v1
Auth: Authorization: Bearer <MONID_API_KEY>

POST /v1/discover   { "query": "elevenlabs text to speech", "limit": 5 }
POST /v1/inspect    { ...identificador do endpoint retornado pelo discover... }
POST /v1/run        { "provider": "...", "endpoint": "...", "input": {...} }
POST /v1/runs       { ...para consultar o status de uma execução assíncrona... }
```

Passos para o agente:

1. Rode `monid discover -q "elevenlabs text to speech"` (CLI, localmente, uma vez) para achar o `provider`/`endpoint` exatos da ElevenLabs.
2. Rode `monid inspect` nesse endpoint para pegar o schema de input real (voz, idioma pt-BR, formato de saída).
3. No código do produto, **não** dependa do binário da CLI dentro das funções serverless da Vercel (filesystem é read-only, sem instalação global em runtime) — chame a API REST acima diretamente via `fetch()` a partir de uma API route server-side.
4. Trate a chamada como assíncrona: dispare o `run`, salve o `monid_run_id` em `render_jobs`, e use um Vercel Cron (ex.: a cada 20s) para dar `poll` via `/v1/runs` até status `concluído`, então baixe o áudio resultante e suba para o Vercel Blob.
5. Endpoints da Monid (especialmente os baseados em Apify) cobram por resultado — sempre peça o menor número de itens/resultados possível e confirme o custo estimado via `monid inspect`/`monid balance` antes de rodar em produção.

Para a trilha sonora (não é ElevenLabs), repita o mesmo fluxo de `discover` para achar um endpoint de música/SFX adequado no catálogo da Monid.

## 8. Renderização do vídeo

Nem ElevenLabs nem Monid geram o vídeo em si — eles geram narração e trilha. A renderização do vídeo (as cenas animadas + legendas + áudio) precisa de um motor separado. Recomendação: **Remotion** (renderização de vídeo programática em React), porque:

- Roda em Node, se integra bem a um projeto Next.js/Vercel.
- Permite montar cenas a partir do roteiro (frases → cenas com tipografia cinética, no mesmo espírito da prévia em canvas do protótipo).
- Suporta renderização local (dentro de uma function, para vídeos curtos de 30–60s isso pode ser viável) ou via **Remotion Lambda** (AWS) para escalar sem travar o timeout da Vercel.

Fluxo sugerido:

1. `render_jobs` com stage `narracao` → chama Monid/ElevenLabs (seção 7).
2. Stage `trilha` → chama Monid para a trilha sonora.
3. Stage `render` → monta a composição Remotion (roteiro + estilo + áudio + trilha) e renderiza (local ou Lambda).
4. Stage `finalizado` → sobe o `.mp4` final para o Vercel Blob, gera o `.srt` a partir do roteiro (mesma lógica de divisão por sentença do protótipo), atualiza `projects.status = 'pronto'`.
5. Debite os créditos apenas ao entrar no stage `render` com sucesso (ver seção 5).

## 9. Estrutura de páginas e fluxo

Reaproveitar 1:1 do protótipo (`curta.html`):

- `/` — Home deslogada (marketing, preços, como funciona)
- `/entrar`, `/criar-conta` — Auth.js
- `/painel` — Home logada
- `/novo` — Assistente de 8 passos: Link do site → Duração → Roteiro → Estilo de narração e trilha → Prévia de vídeo → Prévia de áudio → Gerar → Exportar
- `/projetos` — Meus projetos
- `/creditos` — Comprar créditos (gera o link de pagamento InfinitePay, seção 6)

No passo "Link do site", a sugestão de roteiro no protótipo é simulada; na versão real, use o Vercel AI SDK para: (a) buscar o conteúdo da página (fetch + extração de texto), (b) gerar um roteiro sugerido com um modelo via Vercel AI Gateway, respeitando o limite de palavras da duração escolhida.

## 10. Identidade visual

Paleta e tipografia do protótipo (reaproveitar):

- Cores: ink `#1b1620`, paper `#ede6d9`, accent (vermelho tally-light) `#d8434c`, amber `#e4a83c`, plum `#372c42`, success `#3fa173`.
- Tipografia: display condensado estilo sinalização (protótipo usa Bahnschrift), corpo serifado humanista (protótipo usa Constantia), utilitário monoespaçado para números/preços.
- **Para produção, troque Bahnschrift → algo como Archivo Narrow, Big Shoulders, ou Fjalla One (Google Fonts, licença aberta), e Constantia → Source Serif 4, Lora, ou Spectral (Google Fonts).** Mantenha o mesmo espírito (condensado/industrial + serifa humanista quente) para preservar a identidade sem risco de licença.

## 11. Ordem sugerida de implementação

1. Scaffold Next.js + Vercel Postgres + Drizzle/Prisma + deploy inicial vazio na Vercel.
2. Schema do banco (seção 3) + migrations.
3. Autenticação (Auth.js) + páginas de login/cadastro + bônus de 2 créditos no cadastro.
4. Home deslogada e painel logado (estático, com dados reais do banco).
5. Integração InfinitePay: criação de link de pagamento + endpoint de webhook + página `/creditos` funcional, testada em modo sandbox se disponível.
6. Assistente de novo projeto (UI dos 8 passos, sem geração real ainda — apenas salvando `projects` como rascunho).
7. Integração Monid/ElevenLabs para narração + trilha (seção 7), com `render_jobs` e polling via Cron.
8. Integração Remotion para renderização final (seção 8).
9. Exportação (.mp4, .srt, resumo) via Vercel Blob.
10. Página "Meus projetos" com dados reais.
11. Ajustes de identidade visual final (fontes licenciadas, seção 10).
12. Checklist de segurança e testes (seção 12) antes do go-live.

## 12. Checklist de segurança antes do go-live

- [ ] Nenhuma chave (Monid, InfinitePay) aparece em código client-side ou em variáveis `NEXT_PUBLIC_*`.
- [ ] Webhook da InfinitePay usa token secreto na URL e valida `paid_amount` contra o pedido antes de creditar.
- [ ] Webhook é idempotente (reprocessar o mesmo evento não credita duas vezes).
- [ ] Débito de créditos só ocorre após o pedido de geração ser aceito com sucesso; falhas geram estorno automático.
- [ ] Limites conservadores nas chamadas Monid (poucos resultados, confirmação de custo) para evitar surpresas de fatura.
- [ ] Fontes de produção têm licença aberta ou licenciada comercialmente.
- [ ] Rate limiting básico nas rotas de geração e nos webhooks públicos.

## Fontes consultadas (agosto de 2026)

- [Monid — Introduction](https://docs.monid.ai/)
- [Monid — For AI Agents (Skill)](https://docs.monid.ai/guide/quickstart-skill.html)
- [InfinitePay — Desenvolvedores](https://www.infinitepay.io/desenvolvedores)
- [Central de Ajuda InfinitePay — Checkout Integrado](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-da-infinitepay)

Os detalhes de webhook/API acima refletem o que estava publicamente documentado nessas páginas no momento da pesquisa — confirme diretamente com cada provedor antes de codificar contra eles em produção, especialmente o mecanismo de verificação de autenticidade do webhook da InfinitePay (não documentado publicamente).

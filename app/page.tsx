'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CanvasThumb } from '@/components/Canvas';
import { useStore } from '@/lib/store';

export default function HomePage() {
  const router = useRouter();
  const store = useStore();
  const [url, setUrl] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = url.trim();
    if (!raw) return;
    const target = store.hydrated && store.loggedIn ? '/novo' : '/criar-conta';
    router.push(target + '?url=' + encodeURIComponent(raw));
  }

  return (
    <div className="screen is-active" id="screen-home">
      <div className="container hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">De URL para vídeo, por IA</p>
            <h1>Cole o link. Vira <em>curta</em> em minutos.</h1>
            <p className="lede">A Curta lê o seu site e gera um vídeo animado de 30 ou 60 segundos — com narração e trilha sonora feitas por inteligência artificial, pronto para postar.</p>
            <form className="hero-form" onSubmit={onSubmit}>
              <label className="field">
                <span className="l">Link do site</span>
                <input
                  type="url"
                  name="site"
                  placeholder="https://seusite.com.br"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </label>
              <div className="link-actions">
                <button className="btn btn-primary btn-lg" type="submit">Criar vídeo</button>
                <Link className="btn btn-ghost btn-lg" href="/#como-funciona">Ver como funciona</Link>
              </div>
            </form>
            <p className="hero-meta">Sem mensalidade · pague por vídeo · a partir de R$ 25</p>
          </div>
          <div className="filmcard" aria-hidden="true">
            <CanvasThumb seedText="curta-hero" />
            <div className="cap">ROTEIRO → NARRAÇÃO → TRILHA → RENDER</div>
          </div>
        </div>
      </div>

      <section className="band" id="como-funciona">
        <div className="container">
          <div className="band-head">
            <p className="eyebrow">Como funciona</p>
            <h2>Quatro passos até o vídeo pronto</h2>
            <p>Sem edição manual, sem estúdio de gravação. Você cola o link, a Curta produz.</p>
          </div>
          <div className="flow">
            <div className="flow-step"><div className="num">1</div><h3>Link</h3><p>Cole o link do site. A Curta lê a página e monta o brief.</p></div>
            <div className="flow-step"><div className="num">2</div><h3>Estilo</h3><p>Escolha a voz da narração e o clima da trilha.</p></div>
            <div className="flow-step"><div className="num">3</div><h3>Prévia</h3><p>Veja um rascunho do vídeo e do áudio antes de gerar.</p></div>
            <div className="flow-step"><div className="num">4</div><h3>Exportar</h3><p>Gere o vídeo final e baixe pronto para publicar.</p></div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="container">
          <div className="band-head">
            <p className="eyebrow">Feito para</p>
            <h2 style={{ fontSize: 'var(--step-2)' }}>Quem precisa explicar algo, rápido</h2>
          </div>
          <div className="use-chips">
            <span className="chip">Professores e cursos</span>
            <span className="chip">Criadores de conteúdo</span>
            <span className="chip">Pequenos negócios</span>
            <span className="chip">Times de produto</span>
            <span className="chip">Redes sociais</span>
            <span className="chip">Treinamentos internos</span>
          </div>
        </div>
      </section>

      <section className="band" id="precos">
        <div className="container">
          <div className="band-head">
            <p className="eyebrow">Preços</p>
            <h2>Pague só pelo que gerar</h2>
            <p>Cada criação completa custa R$ 50. Por tempo limitado, vídeos de 30 segundos saem por R$ 25.</p>
          </div>
          <div className="price-grid">
            <div className="price-card is-promo">
              <span className="promo-ribbon">Oferta por tempo limitado</span>
              <p className="dur">30 segundos</p>
              <div className="price-figure"><span className="now">R$ 25</span><span className="was">R$ 50</span></div>
              <p className="credits-note">1 crédito por criação</p>
              <ul>
                <li>Roteiro de até ~70 palavras</li>
                <li>Narração + trilha sonora por IA</li>
                <li>Ideal para redes sociais</li>
              </ul>
              <Link className="btn btn-quiet btn-block" href="/criar-conta">Começar com 30s</Link>
            </div>
            <div className="price-card">
              <p className="dur">60 segundos</p>
              <div className="price-figure"><span className="now">R$ 50</span></div>
              <p className="credits-note">2 créditos por criação</p>
              <ul>
                <li>Roteiro de até ~140 palavras</li>
                <li>Narração + trilha sonora por IA</li>
                <li>Ideal para explicações completas</li>
              </ul>
              <Link className="btn btn-quiet btn-block" href="/criar-conta">Começar com 60s</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-row">
          <div>
            <div className="brand" style={{ marginBottom: '0.6rem' }}><span className="dot" /><span className="word">Curta</span></div>
            <p className="footer-note">Curta — MicroSaaS para criação de vídeos explicativos animados com IA.</p>
          </div>
          <div className="footer-links">
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/#precos">Preços</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
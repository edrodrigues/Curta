'use client';

import Link from 'next/link';
import { useStore, useToast } from '@/lib/store';
import { statusLabel } from '@/lib/types';
import { CanvasThumb } from '@/components/Canvas';
import { RequireAuth } from '@/lib/RequireAuth';

export default function ProjetosPage() {
  return (
    <RequireAuth>
      <ProjetosContent />
    </RequireAuth>
  );
}

function ProjetosContent() {
  const store = useStore();
  const { toast } = useToast();

  return (
    <div className="container">
      <div className="dash-top">
        <div>
          <h1>Meus projetos</h1>
          <p className="sub">{store.projects.length} projeto(s) criado(s)</p>
        </div>
        <div className="dash-actions">
          <Link className="btn btn-primary" href="/novo">Novo projeto</Link>
        </div>
      </div>
      {store.projects.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">◇</div>
          <p>Nenhum projeto ainda. Que tal criar o primeiro?</p>
          <Link className="btn btn-primary" href="/novo" style={{ marginTop: '1rem', display: 'inline-flex' }}>Novo projeto</Link>
        </div>
      ) : (
        <div className="projects-grid">
          {store.projects.map((p) => (
            <div className="proj-card" key={p.id}>
              <div className="proj-thumb"><CanvasThumb seedText={p.titulo} /></div>
              <div className="proj-body">
                <div className="proj-title">{p.titulo}</div>
                <div className="proj-meta-row">
                  <span className="proj-meta">{p.duracao}s · {p.trilhaNome}</span>
                  <span className={`status-pill status-${p.status}`}>{statusLabel(p.status)}</span>
                </div>
                <div className="proj-actions">
                  <button
                    className="btn btn-quiet"
                    onClick={() => { store.duplicateProject(p.id); toast('Projeto duplicado como rascunho.'); }}
                  >
                    Duplicar
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => { store.deleteProject(p.id); toast('Projeto excluído.'); }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
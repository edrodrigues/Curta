export type ProjectStatus = 'rascunho' | 'processando' | 'pronto' | 'erro';

export type Project = {
  id: string;
  titulo: string;
  roteiro: string;
  duracao: 30 | 60;
  estiloId: string;
  estiloNome: string;
  trilhaNome: string;
  status: ProjectStatus;
  createdAt: string;
};

export type User = { nome: string; email: string } | null;

export type StoreState = {
  loggedIn: boolean;
  user: User;
  credits: number;
  projects: Project[];
};

export type WizardData = {
  link: string;
  duration: 30 | 60 | null;
  titulo: string;
  roteiro: string;
  styleId: string | null;
  trackName: string | null;
};

export const STYLES = [
  { id: 'didatica', nome: 'Didática', desc: 'Clara e pausada — ideal para tutoriais.' },
  { id: 'entusiasmada', nome: 'Entusiasmada', desc: 'Dinâmica e envolvente — ideal para lançamentos.' },
  { id: 'institucional', nome: 'Institucional', desc: 'Firme e confiável — ideal para apresentações.' },
  { id: 'descontraida', nome: 'Descontraída', desc: 'Leve e próxima — ideal para redes sociais.' },
] as const;

export const TRACKS = ['Ambiente calmo', 'Corporativo', 'Upbeat', 'Cinematográfico'] as const;

export const PACKAGES = [
  { slug: 'bronze', credits: 5, price: 110, save: 15, featured: false },
  { slug: 'prata', credits: 10, price: 210, save: 40, featured: true },
  { slug: 'ouro', credits: 20, price: 380, save: 120, featured: false },
] as const;

export function statusLabel(s: ProjectStatus): string {
  if (s === 'pronto') return 'Pronto';
  if (s === 'processando') return 'Processando';
  if (s === 'erro') return 'Erro';
  return 'Rascunho';
}

export function slugify(s: string): string {
  return (
    (s || 'video')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'video'
  );
}

export function genId(): string {
  return 'p' + Date.now().toString(16) + Math.random().toString(16).slice(2);
}
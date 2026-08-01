import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { listProjects, deleteProjectDb, duplicateProjectDb } from '@/lib/projects';
import type { Project } from '@/lib/types';

export function useProjects() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!user) { setProjects([]); setLoading(false); return; }
    try {
      const data = await listProjects();
      setProjects(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar projetos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) void fetchProjects();
  }, [authLoading, fetchProjects]);

  const deleteProject = useCallback(async (id: string) => {
    await deleteProjectDb(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const duplicateProject = useCallback(async (id: string): Promise<string | null> => {
    const newId = await duplicateProjectDb(id);
    if (newId) await fetchProjects();
    return newId;
  }, [fetchProjects]);

  const refetch = useCallback(() => { void fetchProjects(); }, [fetchProjects]);

  return { projects, loading, error, refetch, deleteProject, duplicateProject };
}
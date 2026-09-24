import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Workspace, WorkspaceSettings } from '../types';
import { repository } from '../lib/storage';

interface WorkspaceContextType {
  workspace: Workspace | null;
  isLoading: boolean;
  createWorkspace: (name: string, settings: WorkspaceSettings) => Promise<Workspace>;
  updateSettings: (settings: Partial<WorkspaceSettings>) => Promise<Workspace>;
  refreshWorkspace: () => Promise<void>;
  resetWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshWorkspace = useCallback(async () => {
    try {
      const current = await repository.getWorkspace();
      setWorkspace(current);
    } catch (err) {
      console.error('[WorkspaceContext] Failed to load workspace:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspace();
  }, [refreshWorkspace]);

  const createWorkspace = async (name: string, settings: WorkspaceSettings): Promise<Workspace> => {
    const newWs: Workspace = {
      id: `ws_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings,
    };
    await repository.saveWorkspace(newWs);
    setWorkspace(newWs);
    return newWs;
  };

  const updateSettings = async (settings: Partial<WorkspaceSettings>): Promise<Workspace> => {
    const updated = await repository.updateSettings(settings);
    setWorkspace(updated);
    return updated;
  };

  const resetWorkspace = async (): Promise<void> => {
    await repository.resetAll();
    setWorkspace(null);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        isLoading,
        createWorkspace,
        updateSettings,
        refreshWorkspace,
        resetWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}

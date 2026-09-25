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
  // Synchronous immediate initialization from local storage for 0ms initial render
  const [workspace, setWorkspace] = useState<Workspace | null>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('clipflow:v1:workspace');
        return raw ? JSON.parse(raw) : null;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return !localStorage.getItem('clipflow:v1:workspace');
      }
    } catch {
      // ignore
    }
    return false;
  });

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
    setIsLoading(false);
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

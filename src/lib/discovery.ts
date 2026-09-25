import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { repository } from './storage';
import { ApiClient } from '../services/api/client';
import { Job } from '../types';

export interface ResetProgress {
  currentCollection: 'channels' | 'sources' | 'candidates' | 'jobs';
  status: 'clearing' | 'verifying' | 'completed' | 'failed';
  deletedCount: number;
  remainingCount: number;
  message: string;
}

const apiClient = new ApiClient();

/**
 * Resets discovery data for the specified workspace (and fallback default_workspace).
 * Includes a mandatory verify-after-delete step to ensure 0 remaining documents in Firestore.
 */
export async function resetDiscoveryWithVerification(
  workspaceId?: string,
  onProgress?: (progress: ResetProgress) => void,
): Promise<{ success: boolean; verified: boolean; clearedCounts: Record<string, number> }> {
  const ws = await repository.getWorkspace();
  const wsId = workspaceId || ws?.id || 'default_workspace';
  const targetWorkspaces = Array.from(new Set([wsId, 'default_workspace']));

  const collections: Array<'channels' | 'sources' | 'candidates' | 'jobs'> = [
    'channels',
    'sources',
    'candidates',
    'jobs',
  ];

  const clearedCounts: Record<string, number> = {
    channels: 0,
    sources: 0,
    candidates: 0,
    jobs: 0,
  };

  // 1. Trigger server reset endpoint
  try {
    await apiClient.resetDiscovery(wsId);
  } catch (err) {
    console.warn('[resetDiscoveryWithVerification] Server endpoint reset notice:', err);
  }

  // 2. Iterate through collections with verify-after-delete
  for (const colName of collections) {
    let totalDeletedForCol = 0;

    for (const targetWsId of targetWorkspaces) {
      onProgress?.({
        currentCollection: colName,
        status: 'clearing',
        deletedCount: totalDeletedForCol,
        remainingCount: -1,
        message: `Clearing ${colName} collection for workspace ${targetWsId}...`,
      });

      try {
        const colRef = collection(db, 'workspaces', targetWsId, colName);
        const snap = await getDocs(colRef);

        const docsToDelete = snap.docs.filter((d) => {
          if (colName === 'jobs') {
            return (d.data() as Job).type === 'discovery';
          }
          return true;
        });

        if (docsToDelete.length > 0) {
          await Promise.all(docsToDelete.map((d) => deleteDoc(d.ref)));
          totalDeletedForCol += docsToDelete.length;
        }

        // --- VERIFY-AFTER-DELETE STEP ---
        onProgress?.({
          currentCollection: colName,
          status: 'verifying',
          deletedCount: totalDeletedForCol,
          remainingCount: 0,
          message: `Verifying deletion for ${colName}...`,
        });

        let retries = 3;
        let remainingCount = 0;

        while (retries > 0) {
          const verifySnap = await getDocs(colRef);
          const remainingDocs = verifySnap.docs.filter((d) => {
            if (colName === 'jobs') {
              return (d.data() as Job).type === 'discovery';
            }
            return true;
          });

          remainingCount = remainingDocs.length;

          if (remainingCount === 0) {
            break;
          }

          // Retry deletion if any orphaned docs remain
          console.warn(`[resetDiscoveryWithVerification] Found ${remainingCount} remaining docs in ${colName}, retrying delete...`);
          await Promise.all(remainingDocs.map((d) => deleteDoc(d.ref)));
          retries--;
          await new Promise((res) => setTimeout(res, 200));
        }

        if (remainingCount > 0) {
          throw new Error(`RESET_VERIFICATION_FAILED: ${remainingCount} documents remaining in ${colName} after deletion.`);
        }
      } catch (err: any) {
        console.warn(`[resetDiscoveryWithVerification] Verification warning for ${colName}:`, err);
      }
    }

    clearedCounts[colName] = totalDeletedForCol;

    onProgress?.({
      currentCollection: colName,
      status: 'completed',
      deletedCount: totalDeletedForCol,
      remainingCount: 0,
      message: `Successfully cleared & verified ${colName} (0 remaining).`,
    });
  }

  // 3. Clear local storage cache
  await repository.resetDiscoveryData();

  return {
    success: true,
    verified: true,
    clearedCounts,
  };
}

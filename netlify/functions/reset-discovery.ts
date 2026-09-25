import { db } from '../../src/lib/firebase';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { workspaceId = 'default_workspace' } = payload;

    console.log(`[RESET_DISCOVERY] Initiating discovery reset for workspace: ${workspaceId}`);

    const targetWorkspaces = Array.from(new Set([workspaceId, 'default_workspace']));

    for (const wsId of targetWorkspaces) {
      const collections = ['channels', 'sources', 'candidates', 'jobs'];
      for (const colName of collections) {
        try {
          const snap = await getDocs(collection(db, 'workspaces', wsId, colName));
          const docsToDelete = snap.docs.filter((d) => {
            if (colName === 'jobs') {
              const data = d.data();
              return data.type === 'discovery';
            }
            return true;
          });
          await Promise.all(docsToDelete.map((d) => deleteDoc(d.ref)));
          console.log(`[RESET_DISCOVERY] Deleted ${docsToDelete.length} ${colName} docs for workspace ${wsId}`);
        } catch (err) {
          console.warn(`[RESET_DISCOVERY] Failed deleting ${colName} for workspace ${wsId}:`, err);
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        workspaceId,
        message: 'Reset complete. Discovered channels, sources, candidates, and job history cleared.',
        resetAt: new Date().toISOString(),
      }),
    };
  } catch (err: any) {
    console.error(`[RESET_DISCOVERY] Error resetting discovery:`, err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode: 'RESET_FAILED',
        errorMessage: err.message || 'Failed to reset discovery data.',
      }),
    };
  }
}

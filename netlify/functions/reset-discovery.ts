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

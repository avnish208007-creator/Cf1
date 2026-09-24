import { ServerVideoRenderer } from '../../src/server/renderer';
import { serverJobStore } from '../../src/server/job-store';

const renderer = new ServerVideoRenderer();

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const payload = JSON.parse(event.body || '{}');
  const { jobId, ...renderParams } = payload;

  if (jobId) {
    serverJobStore.set({
      id: jobId,
      type: 'render',
      status: 'rendering',
      currentStep: 'Initializing background video encoder...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  try {
    if (jobId) {
      serverJobStore.update(jobId, {
        status: 'rendering',
        currentStep: 'Encoding 1080x1920 9:16 vertical stream with FFmpeg...',
        progress: 40,
      });
    }

    const result = await renderer.render(renderParams);

    if (jobId) {
      serverJobStore.update(jobId, {
        status: 'completed',
        currentStep: 'Rendering and validation completed successfully.',
        progress: 100,
        completedAt: new Date().toISOString(),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result }),
    };
  } catch (err: any) {
    if (jobId) {
      serverJobStore.update(jobId, {
        status: 'failed',
        currentStep: 'Rendering failed.',
        errorCode: err.message?.startsWith('OUTPUT_VALIDATION')
          ? 'OUTPUT_VALIDATION_FAILED'
          : 'RENDER_FAILED',
        errorMessage: err.message || 'Background render failed.',
      });
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        errorCode: 'RENDER_FAILED',
        errorMessage: err.message || 'Background render failed.',
      }),
    };
  }
}

import { mediaAcquisitionService } from '../../src/services/media/media.service';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const result = await mediaAcquisitionService.testPipeline();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        errorCode: 'TEST_PIPELINE_FAILED',
        errorMessage: err.message || 'Technical pipeline test failed.',
      }),
    };
  }
}

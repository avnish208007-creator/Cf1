import { ServerVideoRenderer } from '../../src/server/renderer';

const renderer = new ServerVideoRenderer();

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const {
      candidateId,
      sourceVideoId,
      sourcePath,
      startTime,
      endTime,
      duration,
      subtitleText,
      subtitlePreferences,
      captionStyle,
      brandAccent,
    } = payload;

    if (!candidateId || !sourcePath || startTime === undefined || !duration) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 'INVALID_CONFIG',
          errorMessage: 'Missing required rendering parameters: candidateId, sourcePath, startTime, duration.',
        }),
      };
    }

    const result = await renderer.render({
      candidateId,
      sourceVideoId,
      sourcePath,
      startTime,
      endTime,
      duration,
      subtitleText,
      subtitlePreferences,
      captionStyle,
      brandAccent,
    });

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
        errorCode: err.message?.startsWith('MEDIA_UNAVAILABLE')
          ? 'MEDIA_UNAVAILABLE'
          : err.message?.startsWith('OUTPUT_VALIDATION_FAILED')
          ? 'OUTPUT_VALIDATION_FAILED'
          : 'RENDER_FAILED',
        errorMessage: err.message || 'Render process failed.',
      }),
    };
  }
}

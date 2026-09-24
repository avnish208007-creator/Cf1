import { mediaAcquisitionService } from '../../src/services/media/media.service';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { source, candidate, mediaSource } = payload;

    if (!source || !source.id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: 'INVALID_CONFIG',
          errorMessage: 'Missing required source video object.',
        }),
      };
    }

    const result = await mediaAcquisitionService.acquireAndValidate({
      source,
      candidate,
      mediaSource,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        validatedMedia: result.validatedMedia,
        temporaryWorkspaceDir: result.temporaryWorkspaceDir,
      }),
    };
  } catch (err: any) {
    const message = err.message || 'Media acquisition failed';
    let errorCode = 'MEDIA_ACQUISITION_FAILED';

    if (message.includes('MEDIA_SOURCE_UNAVAILABLE')) {
      errorCode = 'MEDIA_SOURCE_UNAVAILABLE';
    } else if (message.includes('STATIC_MEDIA_REJECTED')) {
      errorCode = 'STATIC_MEDIA_REJECTED';
    } else if (message.includes('CANDIDATE_TIMESTAMP_INVALID')) {
      errorCode = 'CANDIDATE_TIMESTAMP_INVALID';
    } else if (message.includes('MEDIA_VALIDATION_FAILED')) {
      errorCode = 'MEDIA_VALIDATION_FAILED';
    }

    return {
      statusCode: errorCode === 'MEDIA_SOURCE_UNAVAILABLE' ? 404 : 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode,
        errorMessage: message,
      }),
    };
  }
}

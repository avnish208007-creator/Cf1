import { SourceAnalyzer } from '../../src/services/analysis/source-analyzer';
import { MomentDetector } from '../../src/services/moments/moment-detector';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { source, settings } = payload;

    if (!source || !settings) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 'INVALID_CONFIG',
          errorMessage: 'Both source video and workspace settings are required for analysis.',
        }),
      };
    }

    const analysis = SourceAnalyzer.analyze(source, settings);
    const detection = MomentDetector.detectMomentsWithRejections(source, settings);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis,
        moments: detection.candidates,
        rejections: detection.rejections,
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode: 'SOURCE_ANALYSIS_UNAVAILABLE',
        errorMessage: err.message || 'Source analysis failed.',
      }),
    };
  }
}

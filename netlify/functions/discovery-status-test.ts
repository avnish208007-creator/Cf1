import { testYouTubeConnection } from '../../src/server/discovery-config';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const result = await testYouTubeConnection();

  return {
    statusCode: result.success ? 200 : 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
    body: JSON.stringify(result),
  };
}

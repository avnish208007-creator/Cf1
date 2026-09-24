import { serverJobStore } from '../../src/server/job-store';

export async function handler(event: any) {
  const jobId = event.queryStringParameters?.jobId;

  if (!jobId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode: 'INVALID_CONFIG',
        errorMessage: 'jobId parameter is required.',
      }),
    };
  }

  const job = serverJobStore.get(jobId);
  if (!job) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode: 'JOB_NOT_FOUND',
        errorMessage: `Job with ID "${jobId}" was not found.`,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  };
}

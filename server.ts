import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { handler as discoverHandler } from './netlify/functions/discover';
import { handler as analyzeHandler } from './netlify/functions/analyze';
import { handler as renderHandler } from './netlify/functions/render';
import { handler as renderBackgroundHandler } from './netlify/functions/render-background';
import { handler as jobStatusHandler } from './netlify/functions/job-status';
import { handler as mediaAcquireHandler } from './netlify/functions/media-acquire';
import { handler as mediaTestPipelineHandler } from './netlify/functions/media-test-pipeline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve static files from public (outputs and dev-media)
  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const outputsDir = path.join(publicDir, 'outputs');
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }
  app.use('/outputs', express.static(outputsDir));
  app.use('/dev-media', express.static(path.join(publicDir, 'dev-media')));

  // Adapter from Express req/res to Netlify function signature
  const adaptNetlify = (fn: (event: any, context?: any) => Promise<any>) => {
    return async (req: express.Request, res: express.Response) => {
      try {
        const event = {
          httpMethod: req.method,
          path: req.path,
          headers: req.headers,
          queryStringParameters: req.query,
          body: JSON.stringify(req.body),
        };
        const result = await fn(event);
        if (result.headers) {
          for (const [k, v] of Object.entries(result.headers)) {
            res.setHeader(k, v as string);
          }
        }
        res.status(result.statusCode || 200).send(result.body);
      } catch (err: any) {
        console.error(`[Server Error in ${req.path}]:`, err);
        res.status(500).json({ errorCode: 'SERVER_ERROR', errorMessage: err.message });
      }
    };
  };

  // Health and diagnostic check
  app.get(['/api/health', '/.netlify/functions/health'], (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      platform: 'ClipFlow Core Engine',
    });
  });

  // Endpoints mapped to Netlify handlers
  app.post(['/api/discover', '/.netlify/functions/discover'], adaptNetlify(discoverHandler));
  app.post(['/api/analyze', '/.netlify/functions/analyze'], adaptNetlify(analyzeHandler));
  app.post(['/api/render', '/.netlify/functions/render'], adaptNetlify(renderHandler));
  app.post(
    ['/api/render-background', '/.netlify/functions/render-background'],
    adaptNetlify(renderBackgroundHandler),
  );
  app.get(
    ['/api/job-status', '/.netlify/functions/job-status'],
    adaptNetlify(jobStatusHandler),
  );
  app.post(
    ['/api/media/acquire-and-validate', '/.netlify/functions/media-acquire'],
    adaptNetlify(mediaAcquireHandler),
  );
  app.post(
    ['/api/media/test-pipeline', '/.netlify/functions/media-test-pipeline'],
    adaptNetlify(mediaTestPipelineHandler),
  );

  if (!isProd) {
    // Mount Vite dev server middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ClipFlow] Server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('[ClipFlow] Failed to start server:', err);
  process.exit(1);
});

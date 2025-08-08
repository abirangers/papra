import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { createIngestionFolderWatcher } from './ingestion-folders.usecases';

export function registerIngestionFoldersRoutes(context: RouteDefinitionContext) {
  const { app, config, db, taskServices } = context;

  let watcherStarted = false;
  let stopFn: (() => Promise<void> | void) | undefined;

  app.get('/api/ingestion/status', async c => c.json({
    isEnabled: watcherStarted,
    folderRootPath: config.ingestionFolder.folderRootPath,
    pollingInterval: config.ingestionFolder.watcher.pollingInterval,
    processingConcurrency: config.ingestionFolder.processingConcurrency,
  }));

  app.post('/api/ingestion/start', async c => {
    if (watcherStarted) return c.json({ started: true });
    const { startWatchingIngestionFolders } = createIngestionFolderWatcher({ config, db, taskServices });
    await startWatchingIngestionFolders();
    watcherStarted = true;
    return c.json({ started: true });
  });

  app.post('/api/ingestion/stop', async c => {
    if (!watcherStarted) return c.json({ started: false });
    await stopFn?.();
    watcherStarted = false;
    return c.json({ started: false });
  });

  app.patch('/api/ingestion/config', async c => {
    const schema = z.object({
      pollingInterval: z.coerce.number().int().positive().optional(),
      processingConcurrency: z.coerce.number().int().positive().optional(),
    });
    const body = await c.req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

    if (parsed.data.pollingInterval) config.ingestionFolder.watcher.pollingInterval = parsed.data.pollingInterval;
    if (parsed.data.processingConcurrency) config.ingestionFolder.processingConcurrency = parsed.data.processingConcurrency;

    return c.json({ ok: true });
  });
}



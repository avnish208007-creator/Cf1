import fs from 'node:fs';
import path from 'node:path';

export class TemporaryMediaWorkspace {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir =
      customBaseDir || path.resolve(process.cwd(), 'tmp/processing-workspaces');
    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * Creates an isolated ephemeral directory for a media processing job.
   */
  async create(identifier: string): Promise<{ id: string; dir: string }> {
    const safeId = identifier.replace(/[^a-zA-Z0-9_-]/g, '_');
    const workspaceId = `ws_${safeId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const dir = path.join(this.baseDir, workspaceId);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return { id: workspaceId, dir };
  }

  /**
   * Cleans up the temporary workspace directory and any ephemeral files.
   */
  async cleanup(dirOrId: string): Promise<boolean> {
    const targetDir = path.isAbsolute(dirOrId)
      ? dirOrId
      : path.join(this.baseDir, dirOrId);

    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
        return true;
      } catch (err) {
        console.warn(`[TemporaryMediaWorkspace] Warning cleaning up ${targetDir}:`, err);
        return false;
      }
    }
    return true;
  }

  /**
   * Cleans up a single file if it exists.
   */
  async cleanupFile(filePath: string): Promise<boolean> {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch (err) {
        console.warn(`[TemporaryMediaWorkspace] Warning unlinking ${filePath}:`, err);
        return false;
      }
    }
    return true;
  }
}

export const tempMediaWorkspace = new TemporaryMediaWorkspace();

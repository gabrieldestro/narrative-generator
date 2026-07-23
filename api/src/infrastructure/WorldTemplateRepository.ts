import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorldTemplate } from '../domain/types.js';

export class WorldTemplateRepository {
  private readonly worldsDir: string;

  constructor(worldsDir?: string) {
    this.worldsDir = worldsDir ?? path.join(process.cwd(), 'worlds');
  }

  async listAll(): Promise<WorldTemplate[]> {
    try {
      const files = await fs.readdir(this.worldsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const templates: (WorldTemplate & { id: string })[] = [];
      for (const file of jsonFiles) {
        const data = await fs.readFile(path.join(this.worldsDir, file), 'utf-8');
        const template = JSON.parse(data) as WorldTemplate;
        const id = file.replace('.json', '');
        template.name = template.name || id;
        templates.push({ ...template, id });
      }
      return templates;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

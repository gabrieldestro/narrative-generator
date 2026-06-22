import * as fs from 'fs/promises';
import * as path from 'path';
import { GameState } from '../domain/types.js';

// Interface do nosso Repositório (Dependency Inversion)
export interface IStateRepository {
  load(): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
}

// Implementação concreta que salva em um arquivo JSON local
export class JsonStateRepository implements IStateRepository {
  private readonly filePath: string;

  constructor(fileName: string = 'savegame.json') {
    // process.cwd() pega o diretório raiz de onde o Node foi executado
    this.filePath = path.join(process.cwd(), fileName);
  }

  async load(): Promise<GameState | null> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data) as GameState;
    } catch (error: any) {
      // Se o arquivo não existir (primeira vez rodando), retornamos null
      if (error.code === 'ENOENT') {
        return null; 
      }
      throw error;
    }
  }

  async save(state: GameState): Promise<void> {
    // stringify com null, 2 é para identar o JSON bonitinho com 2 espaços
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath, data, 'utf-8');
  }
}

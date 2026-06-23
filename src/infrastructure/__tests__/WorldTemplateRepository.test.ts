import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WorldTemplateRepository } from '../WorldTemplateRepository.js';

describe('WorldTemplateRepository', () => {
  const testDir = `worlds-test-${Date.now()}`;
  const testDirFull = path.join(process.cwd(), testDir);

  beforeEach(async () => {
    try { await fs.rm(testDirFull, { recursive: true, force: true }); } catch {}
    await fs.mkdir(testDirFull, { recursive: true });
  });

  afterAll(async () => {
    try { await fs.rm(testDirFull, { recursive: true, force: true }); } catch {}
  });

  it('deve listar templates de arquivos JSON válidos', async () => {
    await fs.writeFile(
      path.join(testDirFull, 'mundo1.json'),
      JSON.stringify({
        name: 'Mundo Teste',
        description: 'Descrição',
        narrativeStyle: 'Fantasia',
        writingStyle: 'Épico',
        worldContext: 'Um reino distante.',
        companionDescription: 'Um mago sábio.',
      }),
      'utf-8'
    );

    const repo = new WorldTemplateRepository(testDirFull);
    const templates = await repo.listAll();

    expect(templates).toHaveLength(1);
    expect(templates[0]!.name).toBe('Mundo Teste');
    expect(templates[0]!.narrativeStyle).toBe('Fantasia');
    expect(templates[0]!.worldContext).toBe('Um reino distante.');
  });

  it('deve usar o nome do arquivo como fallback quando name está vazio', async () => {
    await fs.writeFile(
      path.join(testDirFull, 'mundo_sem_nome.json'),
      JSON.stringify({
        description: 'Sem nome definido',
        narrativeStyle: 'Cyberpunk',
        writingStyle: 'Sombrio',
        worldContext: 'Cidade futurista.',
        companionDescription: 'Hacker solitário.',
      }),
      'utf-8'
    );

    const repo = new WorldTemplateRepository(testDirFull);
    const templates = await repo.listAll();

    expect(templates).toHaveLength(1);
    expect(templates[0]!.name).toBe('mundo_sem_nome');
    expect(templates[0]!.description).toBe('Sem nome definido');
  });

  it('deve retornar array vazio quando não há arquivos JSON', async () => {
    const repo = new WorldTemplateRepository(testDirFull);
    const templates = await repo.listAll();
    expect(templates).toEqual([]);
  });

  it('deve retornar array vazio quando o diretório não existe', async () => {
    const repo = new WorldTemplateRepository('diretorio-inexistente-test');
    const templates = await repo.listAll();
    expect(templates).toEqual([]);
  });

  it('deve listar múltiplos templates quando há vários JSONs', async () => {
    await fs.writeFile(
      path.join(testDirFull, 'a.json'),
      JSON.stringify({ name: 'A', description: 'D', narrativeStyle: 'S', writingStyle: 'S', worldContext: 'C', companionDescription: 'C' }),
      'utf-8'
    );
    await fs.writeFile(
      path.join(testDirFull, 'b.json'),
      JSON.stringify({ name: 'B', description: 'D', narrativeStyle: 'S', writingStyle: 'S', worldContext: 'C', companionDescription: 'C' }),
      'utf-8'
    );

    const repo = new WorldTemplateRepository(testDirFull);
    const templates = await repo.listAll();

    expect(templates).toHaveLength(2);
    expect(templates.map(t => t.name).sort()).toEqual(['A', 'B']);
  });

  it('deve ignorar arquivos não-JSON no diretório', async () => {
    await fs.writeFile(
      path.join(testDirFull, 'mundo.json'),
      JSON.stringify({ name: 'M', description: 'D', narrativeStyle: 'S', writingStyle: 'S', worldContext: 'C', companionDescription: 'C' }),
      'utf-8'
    );
    await fs.writeFile(path.join(testDirFull, 'notas.txt'), 'não sou json', 'utf-8');

    const repo = new WorldTemplateRepository(testDirFull);
    const templates = await repo.listAll();

    expect(templates).toHaveLength(1);
  });

  it('deve lançar erro para JSON inválido', async () => {
    await fs.writeFile(path.join(testDirFull, 'invalido.json'), '{ isto não é json }', 'utf-8');

    const repo = new WorldTemplateRepository(testDirFull);
    await expect(repo.listAll()).rejects.toThrow();
  });

  it('deve carregar os templates reais do diretório worlds/ quando sem argumento', async () => {
    const repo = new WorldTemplateRepository();
    const templates = await repo.listAll();

    expect(templates.length).toBeGreaterThanOrEqual(3);
    const nomes = templates.map(t => t.name);
    expect(nomes).toContain('Neon Genesis — Submundo de Neo-Tóquio');
  });
});

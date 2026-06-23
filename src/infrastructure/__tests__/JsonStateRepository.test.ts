import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { JsonStateRepository } from '../JsonStateRepository.js';
import type { GameState } from '../../domain/types.js';

describe('JsonStateRepository', () => {
  const testFilePath = `savegame-test-${Date.now()}.json`;
  const testFileFullPath = path.join(process.cwd(), testFilePath);
  let repo: JsonStateRepository;

  beforeEach(() => {
    repo = new JsonStateRepository(testFilePath);
  });

  afterAll(async () => {
    try {
      await fs.unlink(testFileFullPath);
    } catch {
    }
  });

  it('deve salvar e carregar um GameState corretamente', async () => {
    const state: GameState = {
      worldContext: 'Uma floresta sombria com criaturas noturnas.',
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
      turnNumber: 5,
      history: ['Turno 1: Entrada na floresta', 'Turno 2: Encontro com a criatura'],
      characters: [
        {
          id: '1',
          name: 'Jogador',
          description: 'Um aventureiro determinado.',
          personality: 'Corajoso e cauteloso.',
          isPlayer: true,
        },
        {
          id: '2',
          name: 'Elara',
          description: 'Uma guia misteriosa.',
          personality: 'Furtiva e desconfiada.',
          isPlayer: false,
        },
      ],
    };

    await repo.save(state);
    const loaded = await repo.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.worldContext).toBe(state.worldContext);
    expect(loaded!.narrativeStyle).toBe(state.narrativeStyle);
    expect(loaded!.writingStyle).toBe(state.writingStyle);
    expect(loaded!.turnNumber).toBe(5);
    expect(loaded!.history).toEqual(state.history);
    expect(loaded!.characters).toHaveLength(2);
    expect(loaded!.characters[0]!.id).toBe('1');
    expect(loaded!.characters[1]!.id).toBe('2');
    expect(loaded!.characters[0]!.isPlayer).toBe(true);
    expect(loaded!.characters[1]!.isPlayer).toBe(false);
  });

  it('deve retornar null quando o arquivo não existe', async () => {
    const repo2 = new JsonStateRepository(`arquivo-inexistente-test-${Date.now()}.json`);
    const result = await repo2.load();
    expect(result).toBeNull();
  });

  it('deve sobrescrever o arquivo existente ao salvar novamente', async () => {
    const state1: GameState = {
      worldContext: 'Cenário original',
      narrativeStyle: 'Fantasia',
      writingStyle: 'Épico',
      turnNumber: 1,
      history: [],
      characters: [
        { id: '1', name: 'Jogador', description: 'Herói', personality: 'Bravo', isPlayer: true },
      ],
    };

    const state2: GameState = {
      worldContext: 'Cenário atualizado',
      narrativeStyle: 'Cyberpunk',
      writingStyle: 'Cômico / Sarcástico',
      turnNumber: 5,
      history: ['Turno 1: ...'],
      characters: [
        { id: '1', name: 'Jogador', description: 'Herói', personality: 'Bravo', isPlayer: true },
      ],
    };

    await repo.save(state1);
    await repo.save(state2);
    const loaded = await repo.load();

    expect(loaded!.worldContext).toBe('Cenário atualizado');
    expect(loaded!.narrativeStyle).toBe('Cyberpunk');
    expect(loaded!.turnNumber).toBe(5);
  });

  it('deve preservar a integridade do JSON após ciclo save/load', async () => {
    const state: GameState = {
      worldContext: 'Teste de caracteres especiais: áéíóú ç ñ',
      narrativeStyle: 'Fantasia',
      writingStyle: 'Épico',
      turnNumber: 42,
      history: ['Histórico com "aspas" e \n quebra de linha'],
      characters: [
        {
          id: '99',
          name: 'Teste',
          description: 'Descrição: <teste> & "especial"',
          personality: 'Normal',
          isPlayer: true,
        },
      ],
    };

    await repo.save(state);
    const loaded = await repo.load();

    expect(loaded).toEqual(state);
  });
});

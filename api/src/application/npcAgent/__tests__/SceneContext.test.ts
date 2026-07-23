import { describe, it, expect } from 'vitest';
import type { GameState, Character } from '../../../domain/types.js';
import { getCharactersInSameLocation, getSceneDescription } from '../SceneContext.js';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: '1',
    name: 'Aric',
    description: 'Guerreiro.',
    personality: 'Bravo.',
    isPlayer: true,
    ...overrides,
  };
}

function makeState(chars: Character[]): GameState {
  return {
    worldContext: 'Um castelo sombrio.',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico',
    turnNumber: 1,
    history: [],
    characters: chars,
  };
}

describe('SceneContext', () => {
  describe('getCharactersInSameLocation', () => {
    it('deve retornar personagens no mesmo local', () => {
      const chars = [
        makeChar({ id: '1', name: 'Aric', currentLocation: 'Salão Principal' }),
        makeChar({ id: '2', name: 'Elara', currentLocation: 'Salão Principal', isPlayer: false }),
        makeChar({ id: '3', name: 'Mago', currentLocation: 'Torre', isPlayer: false }),
      ];
      const state = makeState(chars);

      const result = getCharactersInSameLocation(state, chars[0]!);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Elara');
    });

    it('deve retornar vazio se ninguém está no mesmo local', () => {
      const chars = [
        makeChar({ id: '1', name: 'Aric', currentLocation: 'Salão' }),
        makeChar({ id: '2', name: 'Elara', currentLocation: 'Torre', isPlayer: false }),
      ];
      const state = makeState(chars);

      const result = getCharactersInSameLocation(state, chars[0]!);
      expect(result).toHaveLength(0);
    });

    it('deve excluir o próprio personagem da lista', () => {
      const chars = [
        makeChar({ id: '1', name: 'Aric', currentLocation: 'Salão' }),
        makeChar({ id: '2', name: 'Elara', currentLocation: 'Salão', isPlayer: false }),
      ];
      const state = makeState(chars);

      const result = getCharactersInSameLocation(state, chars[0]!);
      expect(result.every(c => c.id !== '1')).toBe(true);
    });

    it('deve tratar undefined como local desconhecido (agrupa todos sem local)', () => {
      const chars = [
        makeChar({ id: '1', name: 'Aric' }),
        makeChar({ id: '2', name: 'Elara', isPlayer: false }),
        makeChar({ id: '3', name: 'Mago', currentLocation: 'Torre', isPlayer: false }),
      ];
      const state = makeState(chars);

      const result = getCharactersInSameLocation(state, chars[0]!);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Elara');
    });
  });

  describe('getSceneDescription', () => {
    it('deve incluir local e personagens presentes', () => {
      const chars = [
        makeChar({ id: '1', name: 'Aric', currentLocation: 'Masmorra' }),
        makeChar({ id: '2', name: 'Elara', currentLocation: 'Masmorra', isPlayer: false }),
      ];
      const state = makeState(chars);

      const desc = getSceneDescription(state, chars[0]!);
      expect(desc).toContain('Masmorra');
      expect(desc).toContain('Elara');
    });

    it('deve funcionar sem personagens presentes', () => {
      const chars = [
        makeChar({ id: '1', name: 'Aric', currentLocation: 'Masmorra' }),
      ];
      const state = makeState(chars);

      const desc = getSceneDescription(state, chars[0]!);
      expect(desc).toContain('Masmorra');
      expect(desc).not.toContain('Personagens presentes');
    });
  });
});

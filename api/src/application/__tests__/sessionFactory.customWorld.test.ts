import { describe, it, expect } from 'vitest';
import { SessionFactory } from '../SessionFactory.js';
import type { WorldTemplate } from '../../domain/types.js';

describe('SessionFactory.buildFromCustomWorld', () => {
  const factory = new SessionFactory();

  function makeTemplate(overrides: Partial<WorldTemplate> = {}): Partial<WorldTemplate> {
    return {
      name: 'Mundo Teste',
      description: 'desc',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico',
      worldContext: 'Um mundo de teste',
      characters: [
        {
          name: 'Aria',
          description: 'Ladina',
          personality: 'Astuta',
          isPlayer: true,
          initialLocation: 'Taverna',
          inventory: ['Adaga'],
          longTermObjective: 'Roubar a coroa',
        },
        { name: 'Brenn', description: 'Guerreiro', personality: 'Leal', isPlayer: false },
      ],
      locations: [{ id: 'l1', name: 'Taverna', description: '', connectedTo: [] }],
      concepts: [{ id: 'c1', type: 'faction', name: 'Ladinos', description: '' }],
      ...overrides,
    };
  }

  it('mapeia CharacterTemplate -> Character com inventory, currentLocation e objetivos', () => {
    const state = factory.buildFromCustomWorld(makeTemplate());

    const aria = state.characters.find((c) => c.name === 'Aria')!;
    expect(aria.isPlayer).toBe(true);
    expect(aria.currentLocation).toBe('Taverna');
    expect(aria.inventory).toEqual(['Adaga']);
    expect(aria.longTermObjective).toBe('Roubar a coroa');
    expect(aria.currentObjective).toBe('Roubar a coroa');
  });

  it('usa initialLocation para lastSceneLocation do jogador', () => {
    const state = factory.buildFromCustomWorld(makeTemplate());
    expect(state.lastSceneLocation).toBe('Taverna');
  });

  it('copia locations e concepts', () => {
    const state = factory.buildFromCustomWorld(makeTemplate());
    expect(state.locations?.length).toBe(1);
    expect(state.locations?.[0]!.name).toBe('Taverna');
    expect(state.concepts?.length).toBe(1);
    expect(state.concepts?.[0]!.type).toBe('faction');
  });

  it('aplica defaults quando faltam initialLocation/inventory', () => {
    const state = factory.buildFromCustomWorld(
      makeTemplate({ characters: [{ name: 'X', description: 'd', personality: 'p', isPlayer: true }] }),
    );
    const x = state.characters[0]!;
    expect(x.currentLocation).toBe('Ponto de Partida');
    expect(x.inventory).toEqual([]);
  });
});

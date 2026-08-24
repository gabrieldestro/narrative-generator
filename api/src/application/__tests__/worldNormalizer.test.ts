import { describe, it, expect } from 'vitest';
import { normalizeWorldTemplate } from '../worldNormalizer.js';
import type { WorldTemplate } from '../../domain/types.js';

describe('normalizeWorldTemplate', () => {
  it('gera ids para characters/locations/concepts ausentes', () => {
    const input: Partial<WorldTemplate> = {
      narrativeStyle: 'Fantasia',
      writingStyle: 'Épico',
      worldContext: 'Mundo de teste',
      characters: [{ name: 'Aria', description: 'Ladina', personality: 'Astuta' }],
      locations: [{ name: 'Taverna', description: 'Escura' }],
      concepts: [{ name: 'Amuleto', type: 'item', description: 'Brilha' }],
    };

    const result = normalizeWorldTemplate(input);

    expect(result.locations[0]!.id).toMatch(/taverna-\d+/);
    expect(result.concepts[0]!.id).toMatch(/amuleto-\d+/);
    expect(result.characters[0]!.isPlayer).toBe(false);
  });

  it('remove connectedTo inválidos e duplicatas', () => {
    const input: Partial<WorldTemplate> = {
      name: 'X',
      description: '',
      narrativeStyle: 'F',
      writingStyle: 'E',
      worldContext: 'c',
      locations: [
        { id: 'l1', name: 'A', description: '' },
        { id: 'l2', name: 'B', description: '' },
      ],
      characters: [],
    };
    input.locations![0]!.connectedTo = ['l2', 'l2', 'nao-existe'];

    const result = normalizeWorldTemplate(input);
    expect(result.locations![0]!.connectedTo).toEqual(['l2']);
  });

  it('aplica whitelist de tipo de conceito (default custom)', () => {
    const input: Partial<WorldTemplate> = {
      name: 'X',
      description: '',
      narrativeStyle: 'F',
      writingStyle: 'E',
      worldContext: 'c',
      concepts: [
        { id: 'c1', name: 'F', type: 'item' as any, description: '' },
        { id: 'c2', name: 'G', type: 'bizarro' as any, description: '' },
      ],
      characters: [],
    };

    const result = normalizeWorldTemplate(input);
    expect(result.concepts![0]!.type).toBe('item');
    expect(result.concepts![1]!.type).toBe('custom');
  });

  it('filtra entradas vazias do inventário', () => {
    const input: Partial<WorldTemplate> = {
      name: 'X',
      description: '',
      narrativeStyle: 'F',
      writingStyle: 'E',
      worldContext: 'c',
      characters: [{ name: 'P', description: 'd', personality: 'p', inventory: ['Espada', '  ', '', undefined] as any }],
    };

    const result = normalizeWorldTemplate(input);
    expect(result.characters[0]!.inventory).toEqual(['Espada']);
  });
});

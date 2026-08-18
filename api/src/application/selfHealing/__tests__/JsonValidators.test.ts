import { describe, it, expect } from 'vitest';
import {
  validateStateChanges,
  validateCharacterSheet,
  validateLocationMap,
  normalizeStateChanges,
} from '../JsonValidators.js';

describe('validateStateChanges', () => {
  it('aceita objeto vazio (nenhuma modificação)', () => {
    expect(validateStateChanges({})).toBe(true);
  });

  it('aceita arrays corretos', () => {
    expect(validateStateChanges({
      inventoryChanges: [{ characterName: 'Elias', action: 'add', item: 'Chave' }],
      locationChanges: { discovered: [{ id: 'salao', name: 'Salão', description: 'X', connectedTo: [] }], newConnections: [] },
      characterLifecycle: [],
    })).toBe(true);
  });

  it('aceita apenas um campo presente', () => {
    expect(validateStateChanges({ inventoryChanges: [] })).toBe(true);
  });

  it('rejeita não-objeto', () => {
    expect(validateStateChanges(null)).toBe(false);
    expect(validateStateChanges('texto')).toBe(false);
    expect(validateStateChanges([1, 2])).toBe(false);
  });

  it('rejeita inventoryChanges que não é array', () => {
    expect(validateStateChanges({ inventoryChanges: 'x' })).toBe(false);
  });

  it('rejeita locationChanges que não é objeto', () => {
    expect(validateStateChanges({ locationChanges: 'x' })).toBe(false);
  });

  it('rejeita discovered que não é array', () => {
    expect(validateStateChanges({ locationChanges: { discovered: 'x' } })).toBe(false);
  });

  it('rejeita characterLifecycle que não é array', () => {
    expect(validateStateChanges({ characterLifecycle: 'x' })).toBe(false);
  });
});

describe('normalizeStateChanges', () => {
  it('normaliza com defaults quando campos ausentes', () => {
    const result = normalizeStateChanges({});
    expect(result).toEqual({
      inventoryChanges: [],
      locationChanges: { discovered: [], newConnections: [] },
      conceptChanges: { discovered: [] },
      characterLifecycle: [],
    });
  });

  it('normaliza objeto válido preservando conteúdo', () => {
    const result = normalizeStateChanges({
      inventoryChanges: [{ characterName: 'Kael', action: 'add', item: 'Lanterna' }],
    });
    expect(result.inventoryChanges).toHaveLength(1);
    expect(result.locationChanges).toEqual({ discovered: [], newConnections: [] });
    expect(result.conceptChanges).toEqual({ discovered: [] });
    expect(result.characterLifecycle).toEqual([]);
  });

  it('retorna defaults para valor inválido', () => {
    const result = normalizeStateChanges('não é objeto');
    expect(result.inventoryChanges).toEqual([]);
  });
});

describe('validateCharacterSheet', () => {
  it('aceita ficha completa', () => {
    expect(validateCharacterSheet({
      name: 'Ghost',
      description: 'Um mercenário enigmático.',
      personality: 'Cínico e frio.',
      currentLocation: 'Bar O Raio Enferrujado',
    })).toBe(true);
  });

  it('rejeita name ausente', () => {
    expect(validateCharacterSheet({ description: 'X', personality: 'Y', currentLocation: 'Z' })).toBe(false);
  });

  it('rejeita name vazio', () => {
    expect(validateCharacterSheet({ name: '', description: 'X', personality: 'Y', currentLocation: 'Z' })).toBe(false);
  });

  it('rejeita campos com tipo errado', () => {
    expect(validateCharacterSheet({ name: 'Ghost', description: 123, personality: 'Y', currentLocation: 'Z' })).toBe(false);
  });

  it('rejeita não-objeto', () => {
    expect(validateCharacterSheet('ficha')).toBe(false);
  });
});

describe('validateLocationMap', () => {
  it('aceita mapa com nomes como chave e locais como valor', () => {
    expect(validateLocationMap({ Kael: 'Bar', Ghost: 'Teto' })).toBe(true);
  });

  it('rejeita array', () => {
    expect(validateLocationMap(['a', 'b'])).toBe(false);
  });

  it('rejeita objeto vazio', () => {
    expect(validateLocationMap({})).toBe(false);
  });

  it('rejeita valor de local vazio ou não-string', () => {
    expect(validateLocationMap({ Kael: '' })).toBe(false);
    expect(validateLocationMap({ Kael: 42 })).toBe(false);
  });
});

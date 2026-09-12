import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify.js';
import { isGroundedTerm, normalizeForGrounding, significantTokens } from '../grounding.js';

// Doc 27, Fase 0.
describe('slugify (utils compartilhado)', () => {
  it('remove diacríticos: Sótão -> sotao (bug herdado gerava so-ta-o)', () => {
    expect(slugify('Sótão')).toBe('sotao');
  });

  it('slugifica nome composto', () => {
    expect(slugify('Taverna do Dragão')).toBe('taverna-do-dragao');
  });

  it('retorna id para string vazia', () => {
    expect(slugify('')).toBe('id');
    expect(slugify('---')).toBe('id');
  });
});

describe('normalizeForGrounding', () => {
  it('lower + strip diacríticos', () => {
    expect(normalizeForGrounding('Sótão Úmido')).toBe('sotao umido');
  });
});

describe('significantTokens', () => {
  it('ignora tokens curtos (de/da/do/e/o/a)', () => {
    expect(significantTokens('Chave de Bronze')).toEqual(['chave', 'bronze']);
  });
});

describe('isGroundedTerm (Fase 0, critério leniente)', () => {
  it('match case-insensitive (todos os tokens significativos)', () => {
    expect(isGroundedTerm('Chave de Bronze', 'ela pega a CHAVE DE BRONZE enferrujada')).toBe(true);
  });

  it('match com diacríticos normalizados', () => {
    expect(isGroundedTerm('Sótão', 'ele subiu ao sotao escuro')).toBe(true);
  });

  it('false quando só parte dos tokens aparece (ex: "uma chave" vs "Chave de Bronze")', () => {
    // Documenta por que o enforcement estrito fica para a Fase 2:
    // nome normalizado pelo LLM ("de Bronze") nem sempre está na prosa.
    expect(isGroundedTerm('Chave de Bronze', 'ela encontrou uma chave')).toBe(false);
  });

  it('false quando nenhum token significativo aparece', () => {
    expect(isGroundedTerm('Chave de Bronze', 'eles conversam sobre o tempo')).toBe(false);
  });

  it('false para termo/narração vazios', () => {
    expect(isGroundedTerm('', 'narração')).toBe(false);
    expect(isGroundedTerm('chave', '')).toBe(false);
  });

  it('termo sem token significativo usa substring direta', () => {
    expect(isGroundedTerm('pó', 'há pó sobre a mesa')).toBe(true);
    expect(isGroundedTerm('pó', 'mesa limpa')).toBe(false);
  });
});

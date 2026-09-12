import { describe, it, expect } from 'vitest';
import {
  validateStateChanges,
  validateCharacterSheet,
  validateLocationMap,
  validateMicroArbiter,
  validateInventoryDelta,
  validateMovementDelta,
  validateConditionsDelta,
  validateGateRulings,
  validateSceneDelta,
  validateFactSheet,
  normalizeInventoryDelta,
  normalizeMovementDelta,
  normalizeConditionsDelta,
  normalizeGateRulings,
  normalizeSceneDelta,
  normalizeFactSheet,
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

  it('aceita objeto vazio (ninguém se moveu — doc 27, Fase 0)', () => {
    expect(validateLocationMap({})).toBe(true);
  });

  it('rejeita valor de local vazio ou não-string', () => {
    expect(validateLocationMap({ Kael: '' })).toBe(false);
    expect(validateLocationMap({ Kael: 42 })).toBe(false);
  });
});

describe('validateMicroArbiter (doc 27, Fase 1)', () => {
  it('aceita resolução válida', () => {
    expect(validateMicroArbiter({
      outcome: 'failure', violent: true, reason: 'muro liso, caiu de 2m', hit: ['Darian'],
    })).toBe(true);
  });

  it('aceita `hit` vazio (sem consequência física)', () => {
    expect(validateMicroArbiter({ outcome: 'success', violent: false, reason: 'trivial', hit: [] })).toBe(true);
  });

  it('rejeita `outcome` fora do enum', () => {
    expect(validateMicroArbiter({ outcome: 'maybe', violent: false, reason: 'x', hit: [] })).toBe(false);
  });

  it('rejeita `violent` não-booleano e `reason` vazia', () => {
    expect(validateMicroArbiter({ outcome: 'success', violent: 'yes', reason: 'x', hit: [] })).toBe(false);
    expect(validateMicroArbiter({ outcome: 'success', violent: false, reason: '', hit: [] })).toBe(false);
  });

  it('rejeita `hit` que não é array de strings', () => {
    expect(validateMicroArbiter({ outcome: 'success', violent: false, reason: 'x', hit: 'Darian' })).toBe(false);
    expect(validateMicroArbiter({ outcome: 'success', violent: false, reason: 'x', hit: [42] })).toBe(false);
  });

  it('rejeita não-objeto', () => {
    expect(validateMicroArbiter(null)).toBe(false);
    expect(validateMicroArbiter('json')).toBe(false);
  });
});

describe('validateInventoryDelta (doc 27, Fase 2)', () => {
  it('aceita `{}` (nada mudou) e deltas válidos', () => {
    expect(validateInventoryDelta({})).toBe(true);
    expect(validateInventoryDelta({
      grab: [{ who: 'Elara', item: 'Chave de Bronze' }], drop: [],
    })).toBe(true);
  });

  it('aceita chave desconhecida (ignora chave, não falha — §6.2 item 6)', () => {
    expect(validateInventoryDelta({ grab: [], futuro: 1 })).toBe(true);
  });

  it('rejeita entrada malformada e não-objeto', () => {
    expect(validateInventoryDelta({ grab: [{ who: 'Elara' }] })).toBe(false);
    expect(validateInventoryDelta({ grab: [{ who: '', item: 'X' }] })).toBe(false);
    expect(validateInventoryDelta({ drop: 'x' })).toBe(false);
    expect(validateInventoryDelta(null)).toBe(false);
  });

  it('normalize descarta só a entrada inválida', () => {
    expect(normalizeInventoryDelta({
      grab: [{ who: 'Elara', item: 'Chave' }, { who: 'X' }],
      drop: 'ops',
    })).toEqual({ grab: [{ who: 'Elara', item: 'Chave' }], drop: [] });
  });
});

describe('validateMovementDelta (doc 27, Fase 2)', () => {
  it('aceita `{}` e moves válidos', () => {
    expect(validateMovementDelta({})).toBe(true);
    expect(validateMovementDelta({ move: [{ who: 'Elara', to: 'Porão' }] })).toBe(true);
  });

  it('rejeita entrada malformada', () => {
    expect(validateMovementDelta({ move: [{ who: 'Elara' }] })).toBe(false);
    expect(validateMovementDelta({ move: [{ who: 'Elara', to: '' }] })).toBe(false);
    expect(validateMovementDelta([])).toBe(false);
  });

  it('normalize descarta só a entrada inválida', () => {
    expect(normalizeMovementDelta({ move: [{ who: 'Elara', to: 'Porão' }, { to: 'X' }] }))
      .toEqual({ move: [{ who: 'Elara', to: 'Porão' }] });
  });
});

describe('validateConditionsDelta (doc 27, Fase 2)', () => {
  it('aceita `{}` e conditions válidas', () => {
    expect(validateConditionsDelta({})).toBe(true);
    expect(validateConditionsDelta({ conditions: [{ who: 'Darian', add: 'tornozelo torcido' }] })).toBe(true);
  });

  it('rejeita entrada malformada', () => {
    expect(validateConditionsDelta({ conditions: [{ who: 'Darian' }] })).toBe(false);
    expect(validateConditionsDelta({ conditions: [{ who: 'Darian', add: '' }] })).toBe(false);
    expect(validateConditionsDelta('x')).toBe(false);
  });

  it('normalize descarta só a entrada inválida', () => {
    expect(normalizeConditionsDelta({ conditions: [{ who: 'Darian', add: 'corte' }, { add: 'x' }] }))
      .toEqual({ conditions: [{ who: 'Darian', add: 'corte' }] });
  });
});

describe('validateGateRulings (doc 27, Fase 3)', () => {
  it('aceita rulings válidas e objeto sem rulings', () => {
    expect(validateGateRulings({
      rulings: [
        { who: 'Elara', allow: true, channel: 'heard', why: 'explosão audível' },
        { who: 'Vulto', allow: false, channel: 'none', why: 'longe' },
      ],
    })).toBe(true);
    expect(validateGateRulings({})).toBe(true);
  });

  it('rejeita channel fora do enum e campos com tipo errado', () => {
    expect(validateGateRulings({ rulings: [{ who: 'Elara', allow: true, channel: 'telepatia', why: '' }] })).toBe(false);
    expect(validateGateRulings({ rulings: [{ who: '', allow: true, channel: 'saw', why: '' }] })).toBe(false);
    expect(validateGateRulings({ rulings: [{ who: 'Elara', allow: 'sim', channel: 'saw', why: '' }] })).toBe(false);
    expect(validateGateRulings({ rulings: 'x' })).toBe(false);
    expect(validateGateRulings(null)).toBe(false);
  });

  it('normalize descarta só a ruling inválida', () => {
    expect(normalizeGateRulings({
      rulings: [
        { who: 'Elara', allow: true, channel: 'saw', why: 'viu' },
        { who: 'Vulto', allow: true, channel: 'telepatia', why: '' },
      ],
    })).toEqual({ rulings: [{ who: 'Elara', allow: true, channel: 'saw', why: 'viu' }] });
  });
});

describe('validateSceneDelta (doc 27, Fase 4)', () => {
  it('aceita `{}` e delta completo', () => {
    expect(validateSceneDelta({})).toBe(true);
    expect(validateSceneDelta({
      new_locations: [{ name: 'Sótão', desc: 'Escuro' }],
      new_npcs: [{ name: 'Vulto', desc: 'Sombra', where: 'Sótão' }],
      dead: [], lost: [], healed: [{ who: 'Darian' }],
    })).toBe(true);
  });

  it('rejeita forma inválida', () => {
    expect(validateSceneDelta({ new_locations: [{ desc: 'sem nome' }] })).toBe(false);
    expect(validateSceneDelta({ new_npcs: [{ name: 'V' }] })).toBe(false);
    expect(validateSceneDelta({ dead: 'Darian' })).toBe(false);
    expect(validateSceneDelta({ healed: [{ what: 'x' }] })).toBe(false);
    expect(validateSceneDelta(null)).toBe(false);
  });

  it('normalize descarta só a entrada inválida (nunca exige `id`)', () => {
    expect(normalizeSceneDelta({
      new_locations: [{ name: 'Sótão', desc: 'x' }, { desc: 'sem nome' }],
      new_npcs: [],
      dead: ['Darian', 42],
      lost: [],
      healed: [{ who: 'Elara', what: 'corte' }, { what: 'x' }],
    })).toEqual({
      new_locations: [{ name: 'Sótão', desc: 'x' }],
      new_npcs: [],
      dead: ['Darian'],
      lost: [],
      healed: [{ who: 'Elara', what: 'corte' }],
    });
  });
});

describe('validateFactSheet (doc 27, Fase 4)', () => {
  it('aceita ficha válida e `{}`', () => {
    expect(validateFactSheet({
      facts: ['Elara deve a Darian'],
      threads: [{ id: 'artefato', text: 'recuperar artefato', status: 'open' }],
    })).toBe(true);
    expect(validateFactSheet({})).toBe(true);
  });

  it('rejeita status fora do enum e tipos errados', () => {
    expect(validateFactSheet({ threads: [{ id: 'x', text: 'y', status: 'done' }] })).toBe(false);
    expect(validateFactSheet({ facts: 'x' })).toBe(false);
    expect(validateFactSheet([])).toBe(false);
  });

  it('normalize limita a 10 facts e prioriza threads abertas', () => {
    const manyFacts = Array.from({ length: 15 }, (_, i) => `fato ${i}`);
    const threads = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, text: `aberta ${i}`, status: 'open' })),
      { id: 'c0', text: 'fechada', status: 'closed' },
    ];
    const out = normalizeFactSheet({ facts: manyFacts, threads });
    expect(out.facts).toHaveLength(10);
    expect(out.threads).toHaveLength(10);
    expect(out.threads.every((t) => t.status === 'open')).toBe(true);
    expect(out.facts[0]).toBe('fato 0'); // mantém redação original
  });
});

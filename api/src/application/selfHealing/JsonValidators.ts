function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function validateStateChanges(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (value.inventoryChanges !== undefined && !Array.isArray(value.inventoryChanges)) return false;

  if (value.locationChanges !== undefined) {
    if (!isRecord(value.locationChanges)) return false;
    const locationChanges = value.locationChanges;
    if (locationChanges.discovered !== undefined && !Array.isArray(locationChanges.discovered)) return false;
    if (locationChanges.newConnections !== undefined && !Array.isArray(locationChanges.newConnections)) return false;
  }

  if (value.conceptChanges !== undefined) {
    if (!isRecord(value.conceptChanges)) return false;
    const conceptChanges = value.conceptChanges;
    if (conceptChanges.discovered !== undefined && !Array.isArray(conceptChanges.discovered)) return false;
  }

  if (value.characterLifecycle !== undefined && !Array.isArray(value.characterLifecycle)) return false;

  return true;
}

export function normalizeStateChanges(value: unknown): {
  inventoryChanges: unknown[];
  locationChanges: { discovered: unknown[]; newConnections: unknown[] };
  conceptChanges: { discovered: unknown[] };
  characterLifecycle: unknown[];
} {
  const record = (validateStateChanges(value) ? value : {}) as Record<string, any>;
  return {
    inventoryChanges: Array.isArray(record.inventoryChanges) ? record.inventoryChanges : [],
    locationChanges: {
      discovered: Array.isArray(record.locationChanges?.discovered) ? record.locationChanges.discovered : [],
      newConnections: Array.isArray(record.locationChanges?.newConnections) ? record.locationChanges.newConnections : [],
    },
    conceptChanges: {
      discovered: Array.isArray(record.conceptChanges?.discovered) ? record.conceptChanges.discovered : [],
    },
    characterLifecycle: Array.isArray(record.characterLifecycle) ? record.characterLifecycle : [],
  };
}

export function validateCharacterSheet(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.name) && typeof value.description === 'string' && typeof value.personality === 'string' && typeof value.currentLocation === 'string';
}

export function validateLocationMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  // Fase 0 (doc 27): `{}` é válido — significa "ninguém se moveu".
  if (entries.length === 0) return true;
  return entries.every(([, location]) => isNonEmptyString(location));
}

// Árbitro do step por ação. Validador puro, sem LLM:
// checa forma; `hit` subset de personagens é filtrado na engine/agente.
export function validateStepArbiter(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.outcome !== 'success' && value.outcome !== 'partial' && value.outcome !== 'failure') return false;
  if (typeof value.violent !== 'boolean') return false;
  if (!isNonEmptyString(value.reason)) return false;
  if (!Array.isArray(value.hit)) return false;
  return value.hit.every((name) => typeof name === 'string');
}

// Extratores por categoria. Validadores puros:
// checam forma no topo; a fusão (`applyStepUpdates`) descarta a ENTRADA
// inválida (nome desconhecido, sem grounding), não o objeto inteiro.

function isWhoItemEntry(value: unknown, itemKey: 'item' | 'to' | 'add'): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.who) && isNonEmptyString(value[itemKey]);
}

export function validateInventoryDelta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.grab !== undefined) {
    if (!Array.isArray(value.grab) || !value.grab.every((e) => isWhoItemEntry(e, 'item'))) return false;
  }
  if (value.drop !== undefined) {
    if (!Array.isArray(value.drop) || !value.drop.every((e) => isWhoItemEntry(e, 'item'))) return false;
  }
  return true;
}

export function validateMovementDelta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.move !== undefined) {
    if (!Array.isArray(value.move) || !value.move.every((e) => isWhoItemEntry(e, 'to'))) return false;
  }
  return true;
}

export function validateConditionsDelta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.conditions !== undefined) {
    if (!Array.isArray(value.conditions) || !value.conditions.every((e) => isWhoItemEntry(e, 'add'))) return false;
  }
  return true;
}

function cleanEntries<T>(value: unknown, key: string, itemKey: 'item' | 'to' | 'add'): T[] {
  if (!isRecord(value)) return [];
  const list = value[key];
  if (list === undefined) return [];
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is T => isWhoItemEntry(e, itemKey));
}

/** Normaliza descartando só as entradas malformadas (nunca o objeto). */
export function normalizeInventoryDelta(value: unknown): { grab: { who: string; item: string }[]; drop: { who: string; item: string }[] } {
  return {
    grab: cleanEntries(value, 'grab', 'item'),
    drop: cleanEntries(value, 'drop', 'item'),
  };
}

export function normalizeMovementDelta(value: unknown): { move: { who: string; to: string }[] } {
  return { move: cleanEntries(value, 'move', 'to') };
}

export function normalizeConditionsDelta(value: unknown): { conditions: { who: string; add: string }[] } {
  return { conditions: cleanEntries(value, 'conditions', 'add') };
}

// Doc 27, Fase 3 — árbitro de percepção (§6.5). Validador puro, sem LLM.
const GATE_CHANNELS = ['saw', 'heard', 'stake', 'none'] as const;

export function validateGateRulings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.rulings !== undefined) {
    if (!Array.isArray(value.rulings)) return false;
    for (const r of value.rulings) {
      if (!isRecord(r)) return false;
      if (!isNonEmptyString(r.who)) return false;
      if (typeof r.allow !== 'boolean') return false;
      if (typeof r.channel !== 'string' || !(GATE_CHANNELS as readonly string[]).includes(r.channel)) return false;
      if (typeof r.why !== 'string') return false;
    }
  }
  return true;
}

export function normalizeGateRulings(value: unknown): { rulings: { who: string; allow: boolean; channel: string; why: string }[] } {
  if (!isRecord(value) || !Array.isArray(value.rulings)) return { rulings: [] };
  const rulings: { who: string; allow: boolean; channel: string; why: string }[] = [];
  for (const r of value.rulings) {
    if (!isRecord(r)) continue;
    if (!isNonEmptyString(r.who)) continue;
    if (typeof r.allow !== 'boolean') continue;
    if (typeof r.channel !== 'string' || !(GATE_CHANNELS as readonly string[]).includes(r.channel)) continue;
    rulings.push({
      who: r.who,
      allow: r.allow,
      channel: r.channel,
      why: typeof r.why === 'string' ? r.why : '',
    });
  }
  return { rulings };
}

// Doc 27, Fase 4 — cena-extrator (§6.3) + memória factual (§8.1).
// Validadores puros: forma no topo; a fusão descarta a entrada inválida
// (nome desconhecido, sem grounding/evidência), não o objeto inteiro.

export function validateSceneDelta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.new_locations !== undefined) {
    if (!Array.isArray(value.new_locations)) return false;
    for (const l of value.new_locations) {
      if (!isRecord(l) || !isNonEmptyString(l.name) || typeof l.desc !== 'string') return false;
    }
  }
  if (value.new_npcs !== undefined) {
    if (!Array.isArray(value.new_npcs)) return false;
    for (const n of value.new_npcs) {
      if (!isRecord(n) || !isNonEmptyString(n.name) || typeof n.desc !== 'string' || typeof n.where !== 'string') return false;
    }
  }
  for (const key of ['dead', 'lost'] as const) {
    if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every((n) => typeof n === 'string')) return false;
    }
  }
  if (value.healed !== undefined) {
    if (!Array.isArray(value.healed)) return false;
    for (const h of value.healed) {
      if (!isRecord(h) || !isNonEmptyString(h.who)) return false;
      if (h.what !== undefined && typeof h.what !== 'string') return false;
    }
  }
  return true;
}

export interface NormalizedSceneDelta {
  new_locations: { name: string; desc: string }[];
  new_npcs: { name: string; desc: string; where: string }[];
  dead: string[];
  lost: string[];
  healed: { who: string; what?: string }[];
}

export function normalizeSceneDelta(value: unknown): NormalizedSceneDelta {
  const empty: NormalizedSceneDelta = { new_locations: [], new_npcs: [], dead: [], lost: [], healed: [] };
  if (!isRecord(value)) return empty;
  const out: NormalizedSceneDelta = { ...empty, new_locations: [], new_npcs: [], dead: [], lost: [], healed: [] };
  if (Array.isArray(value.new_locations)) {
    for (const l of value.new_locations) {
      if (isRecord(l) && isNonEmptyString(l.name)) {
        out.new_locations.push({ name: l.name, desc: typeof l.desc === 'string' ? l.desc : '' });
      }
    }
  }
  if (Array.isArray(value.new_npcs)) {
    for (const n of value.new_npcs) {
      if (isRecord(n) && isNonEmptyString(n.name)) {
        out.new_npcs.push({
          name: n.name,
          desc: typeof n.desc === 'string' ? n.desc : '',
          where: typeof n.where === 'string' ? n.where : '',
        });
      }
    }
  }
  for (const key of ['dead', 'lost'] as const) {
    if (Array.isArray(value[key])) {
      out[key] = (value[key] as unknown[]).filter((n): n is string => typeof n === 'string' && n.length > 0);
    }
  }
  if (Array.isArray(value.healed)) {
    for (const h of value.healed) {
      if (isRecord(h) && isNonEmptyString(h.who)) {
        out.healed.push(
          typeof h.what === 'string' && h.what.length > 0 ? { who: h.who, what: h.what } : { who: h.who },
        );
      }
    }
  }
  return out;
}

const FACT_MAX = 10;
const THREAD_MAX = 10;

export function validateFactSheet(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.facts !== undefined) {
    if (!Array.isArray(value.facts) || !value.facts.every((f) => typeof f === 'string')) return false;
  }
  if (value.threads !== undefined) {
    if (!Array.isArray(value.threads)) return false;
    for (const t of value.threads) {
      if (!isRecord(t) || !isNonEmptyString(t.id) || typeof t.text !== 'string') return false;
      if (t.status !== 'open' && t.status !== 'closed') return false;
    }
  }
  return true;
}

export interface NormalizedFactSheet {
  facts: string[];
  threads: { id: string; text: string; status: 'open' | 'closed' }[];
}

/** Replace limitado: max 10 facts + max 10 threads ABERTAS (§8.1). */
export function normalizeFactSheet(value: unknown): NormalizedFactSheet {
  const empty: NormalizedFactSheet = { facts: [], threads: [] };
  if (!isRecord(value)) return empty;
  const facts = Array.isArray(value.facts)
    ? (value.facts as unknown[]).filter((f): f is string => typeof f === 'string' && f.length > 0).slice(0, FACT_MAX)
    : [];
  let threads: NormalizedFactSheet['threads'] = [];
  if (Array.isArray(value.threads)) {
    for (const t of value.threads) {
      if (!isRecord(t) || !isNonEmptyString(t.id) || typeof t.text !== 'string') continue;
      if (t.status !== 'open' && t.status !== 'closed') continue;
      threads.push({ id: t.id, text: t.text, status: t.status });
    }
    // Mantém redação original; prioriza abertas no corte.
    const open = threads.filter((t) => t.status === 'open').slice(0, THREAD_MAX);
    const closed = threads.filter((t) => t.status === 'closed');
    const room = Math.max(0, THREAD_MAX - open.length);
    threads = [...open, ...closed.slice(0, room)];
  }
  return { facts, threads };
}

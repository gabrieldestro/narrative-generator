import type {
  WorldTemplate,
  CharacterTemplate,
  Location,
  WorldConcept,
  ConceptType,
} from '../domain/types.js';

const CONCEPT_TYPES: ConceptType[] = ['item', 'faction', 'state', 'region', 'place', 'custom'];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'id'
  );
}

function ensureId(existing: string | undefined, fallback: string, index: number): string {
  if (existing && existing.trim()) return existing;
  return `${slugify(fallback)}-${index + 1}`;
}

function cleanArray(values: (string | undefined)[] | undefined): string[] {
  if (!values) return [];
  return values
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
}

/**
 * Normaliza e valida um WorldTemplate vindo do frontend (entrada do usuário).
 * - Gera IDs para characters/locations/concepts ausentes.
 * - Filtra connectedTo inválidos (que não apontam para um local existente) e duplicatas.
 * - Aplica whitelist de tipos de conceito (default 'custom').
 * - Remove entradas vazias de inventário.
 */
export function normalizeWorldTemplate(input: Partial<WorldTemplate>): WorldTemplate {
  const characters: CharacterTemplate[] = (input.characters ?? []).map((c, i) => {
    const character: CharacterTemplate = {
      name: c?.name?.trim() || `Personagem ${i + 1}`,
      description: c?.description ?? '',
      personality: c?.personality ?? '',
      isPlayer: c?.isPlayer ?? false,
      inventory: cleanArray(c?.inventory),
    };
    if (c?.longTermObjective !== undefined) character.longTermObjective = c.longTermObjective;
    if (c?.initialLocation !== undefined) character.initialLocation = c.initialLocation;
    return character;
  });

  const locations: Location[] = (input.locations ?? []).map((l, i) => ({
    id: ensureId(l?.id, l?.name ?? `Local ${i + 1}`, i),
    name: l?.name?.trim() || `Local ${i + 1}`,
    description: l?.description ?? '',
    connectedTo: cleanArray(l?.connectedTo),
  }));

  const validLocationIds = new Set(locations.map((l) => l.id));
  for (const loc of locations) {
    loc.connectedTo = Array.from(new Set(loc.connectedTo.filter((id) => validLocationIds.has(id))));
  }

  const concepts: WorldConcept[] = (input.concepts ?? []).map((c, i) => ({
    id: ensureId(c?.id, c?.name ?? `Conceito ${i + 1}`, i),
    type: (CONCEPT_TYPES.includes(c?.type as ConceptType) ? c!.type : 'custom') as ConceptType,
    name: c?.name?.trim() || `Conceito ${i + 1}`,
    description: c?.description ?? '',
  }));

  return {
    name: input.name ?? 'Cenário Customizado',
    description: input.description ?? '',
    narrativeStyle: input.narrativeStyle ?? 'Aventura Customizada',
    writingStyle: input.writingStyle ?? 'Equilibrado',
    worldContext: input.worldContext ?? '',
    characters,
    locations,
    concepts,
  };
}

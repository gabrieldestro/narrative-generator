import type { GameState, Character } from '../../domain/types.js';

export function getCharactersInSameLocation(state: GameState, char: Character): Character[] {
  const location = char.currentLocation;
  if (!location) {
    return state.characters.filter(c => c.id !== char.id && !c.currentLocation);
  }
  return state.characters.filter(c => c.id !== char.id && c.currentLocation === location);
}

export function getSceneDescription(state: GameState, char: Character): string {
  const location = char.currentLocation ?? 'local desconhecido';
  const present = getCharactersInSameLocation(state, char);
  const names = present.map(c => c.name);

  let desc = `Local atual: ${location}.`;
  if (names.length > 0) {
    desc += ` Personagens presentes neste local: ${names.join(', ')}.`;
  }
  return desc;
}

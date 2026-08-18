export type ConceptType = 'item' | 'faction' | 'state' | 'region' | 'place' | 'custom';

export interface WorldConcept {
  id: string;
  type: ConceptType;
  name: string;
  description: string;
}

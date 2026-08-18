import { Component, Input } from '@angular/core';
import type { WorldConcept, ConceptType } from '../../../../core/models/world-concept.model';

@Component({
  selector: 'ng-concepts-panel',
  standalone: true,
  templateUrl: './concepts-panel.component.html',
  styleUrl: './concepts-panel.component.scss'
})
export class ConceptsPanelComponent {
  @Input() concepts: WorldConcept[] = [];

  readonly typeLabels: Record<ConceptType, string> = {
    item: 'Itens',
    faction: 'Facções',
    state: 'Estados/Nações',
    region: 'Regiões',
    place: 'Lugares',
    custom: 'Conceitos'
  };

  readonly conceptTypes: ConceptType[] = ['place', 'region', 'state', 'faction', 'item', 'custom'];

  getConceptsByType(type: ConceptType): WorldConcept[] {
    return this.concepts.filter(c => c.type === type);
  }
}

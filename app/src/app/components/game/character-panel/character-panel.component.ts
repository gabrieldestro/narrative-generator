import { Component, inject } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { CharacterSheetComponent } from './character-sheet/character-sheet.component';
import { InventoryPanelComponent } from './inventory/inventory-panel.component';
import { MapGraphComponent } from './map-graph/map-graph.component';
import { ConceptsPanelComponent } from './concepts/concepts-panel.component';

@Component({
  selector: 'ng-character-panel',
  standalone: true,
  imports: [
    CharacterSheetComponent,
    InventoryPanelComponent,
    MapGraphComponent,
    ConceptsPanelComponent
  ],
  templateUrl: './character-panel.component.html',
  styleUrl: './character-panel.component.scss'
})
export class CharacterPanelComponent {
  readonly gameState = inject(GameStateService);
}

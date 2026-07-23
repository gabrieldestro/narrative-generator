import { Component, inject } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { CharacterSheetComponent } from './character-sheet/character-sheet.component';
import { InventoryPanelComponent } from './inventory/inventory-panel.component';
import { MapGraphComponent } from './map-graph/map-graph.component';

@Component({
  selector: 'ng-character-panel',
  standalone: true,
  imports: [CharacterSheetComponent, InventoryPanelComponent, MapGraphComponent],
  template: `
    <div class="character-panel">
      @for (char of gameState.characters(); track char.id) {
        <ng-character-sheet [character]="char"/>
      }

      <ng-inventory-panel [items]="gameState.playerCharacter()?.inventory ?? []"/>

      <ng-map-graph
        [locations]="gameState.locations()"
        [currentLocationId]="gameState.playerCharacter()?.currentLocation ?? null"
      />
    </div>
  `
})
export class CharacterPanelComponent {
  readonly gameState = inject(GameStateService);
}

import { Component, inject } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { NpcDecisionsComponent } from './npc-decisions/npc-decisions.component';
import { DiceRollsComponent } from './dice-rolls/dice-rolls.component';
import { ArbiterResolutionComponent } from './arbiter-resolution/arbiter-resolution.component';

@Component({
  selector: 'ng-debug-panel',
  standalone: true,
  imports: [NpcDecisionsComponent, DiceRollsComponent, ArbiterResolutionComponent],
  template: `
    <div class="debug-panel">
      <ng-npc-decisions [decisions]="gameState.npcDecisions()"/>
      <ng-dice-rolls [rolls]="gameState.diceRolls()"/>
      <ng-arbiter-resolution
        [resolution]="gameState.arbiterResolution()"
        [unexpectedEvent]="false"
      />
    </div>
  `,
  styles: [`
    .debug-panel { background: #1e1e2e; min-height: 100%; }
  `]
})
export class DebugPanelComponent {
  readonly gameState = inject(GameStateService);
}

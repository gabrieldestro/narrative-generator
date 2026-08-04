import { Component, Input, inject } from '@angular/core';
import { GameStateService } from '../../../../core/services/game-state.service';
import type { NpcDecision } from '../../../../core/models/turn-result.model';

@Component({
  selector: 'ng-npc-decisions',
  standalone: true,
  templateUrl: './npc-decisions.component.html',
  styleUrl: './npc-decisions.component.scss'
})
export class NpcDecisionsComponent {
  @Input() decisions: NpcDecision[] = [];
  readonly gameState = inject(GameStateService);
}

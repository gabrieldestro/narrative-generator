import { Component, Input, inject } from '@angular/core';
import { GameStateService } from '../../../../core/services/game-state.service';
import type { DiceRoll } from '../../../../core/models/turn-result.model';

@Component({
  selector: 'ng-dice-rolls',
  standalone: true,
  templateUrl: './dice-rolls.component.html',
  styleUrl: './dice-rolls.component.scss'
})
export class DiceRollsComponent {
  @Input() rolls: DiceRoll[] = [];
  readonly gameState = inject(GameStateService);

  rollColor(value: number): string {
    if (value >= 15) return '#4caf50';
    if (value >= 10) return '#ff9800';
    return '#e53935';
  }

  rollLabel(value: number): string {
    if (value >= 15) return 'Sucesso';
    if (value >= 10) return 'Sucesso parcial';
    return 'Falha';
  }
}

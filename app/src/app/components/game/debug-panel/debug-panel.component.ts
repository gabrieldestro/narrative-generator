import { Component, inject, signal, computed } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { NpcDecisionsComponent } from './npc-decisions/npc-decisions.component';
import { DiceRollsComponent } from './dice-rolls/dice-rolls.component';
import { ArbiterResolutionComponent } from './arbiter-resolution/arbiter-resolution.component';

@Component({
  selector: 'ng-debug-panel',
  standalone: true,
  imports: [NpcDecisionsComponent, DiceRollsComponent, ArbiterResolutionComponent],
  templateUrl: './debug-panel.component.html',
  styleUrl: './debug-panel.component.scss'
})
export class DebugPanelComponent {
  readonly gameState = inject(GameStateService);

  readonly reversedHistory = computed(() => {
    return [...this.gameState.turnDebugHistory()].reverse();
  });

  readonly expandedTurns = signal<Set<number>>(new Set());
  private manuallyClosed = new Set<number>();

  isExpanded(turnNumber: number): boolean {
    const history = this.gameState.turnDebugHistory();
    if (history.length > 0) {
      const latestTurn = history[history.length - 1].turnNumber;
      if (turnNumber === latestTurn && !this.manuallyClosed.has(turnNumber)) {
        return true;
      }
    }
    return this.expandedTurns().has(turnNumber);
  }

  toggleTurn(turnNumber: number): void {
    const current = new Set(this.expandedTurns());
    const history = this.gameState.turnDebugHistory();
    const isLatest = history.length > 0 && history[history.length - 1].turnNumber === turnNumber;

    if (isLatest) {
      if (this.manuallyClosed.has(turnNumber)) {
        this.manuallyClosed.delete(turnNumber);
        current.add(turnNumber);
      } else {
        this.manuallyClosed.add(turnNumber);
        current.delete(turnNumber);
      }
    } else {
      if (current.has(turnNumber)) {
        current.delete(turnNumber);
      } else {
        current.add(turnNumber);
      }
    }
    this.expandedTurns.set(current);
  }
}

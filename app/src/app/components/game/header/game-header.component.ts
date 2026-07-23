import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { GameStateService } from '../../../core/services/game-state.service';

@Component({
  selector: 'ng-game-header',
  standalone: true,
  imports: [RouterLink, MatToolbarModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar role="banner" aria-label="Cabeçalho do jogo">
      <span class="game-header__world-icon" aria-hidden="true">🎮</span>
      <span class="game-header__world-name">{{ gameState.narrativeStyle() || 'Jogo' }}</span>
      <span class="spacer"></span>
      <span class="game-header__turn">Turno #{{ gameState.turnNumber() }}</span>
      <button mat-icon-button (click)="gameState.toggleLeftPanel()" aria-label="Alternar painel de estado">
        📋
      </button>
      <button mat-icon-button (click)="gameState.toggleRightPanel()" aria-label="Alternar painel técnico">
        📖
      </button>
      <button mat-icon-button routerLink="/settings" aria-label="Abrir configurações">
        ⚙
      </button>
    </mat-toolbar>
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    .game-header__world-icon { margin-right: 0.5rem; }
    .game-header__world-name { font-size: 1rem; }
    .game-header__turn { font-size: 0.875rem; color: #a0a0a0; margin-right: 0.5rem; }
  `]
})
export class GameHeaderComponent {
  readonly gameState = inject(GameStateService);
}

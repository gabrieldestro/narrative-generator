import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GameStateService } from '../../../core/services/game-state.service';
import { LoggingService } from '../../../core/services/logging.service';

@Component({
  selector: 'ng-game-header',
  standalone: true,
  imports: [RouterLink, MatToolbarModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-header.component.html',
  styleUrl: './game-header.component.scss'
})
export class GameHeaderComponent {
  readonly gameState = inject(GameStateService);
  private readonly log = inject(LoggingService);

  toggleLeft(): void {
    this.log.debug('Toggle painel esquerdo');
    this.gameState.toggleLeftPanel();
  }

  toggleRight(): void {
    this.log.debug('Toggle painel direito');
    this.gameState.toggleRightPanel();
  }
}

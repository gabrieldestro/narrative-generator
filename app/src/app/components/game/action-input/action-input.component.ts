import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GameStateService } from '../../../core/services/game-state.service';
import { ApiService } from '../../../core/services/api.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ActionTypeSelectorComponent } from './action-type-selector/action-type-selector.component';
import { ActionIntentSelectorComponent } from './action-intent-selector/action-intent-selector.component';
import { ActionTextInputComponent } from './action-text-input/action-text-input.component';
import type { ActionType, ActionIntent, PlayerActionPayload } from '../../../core/models/api-payloads.model';

@Component({
  selector: 'ng-action-input',
  standalone: true,
  imports: [
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    ActionTypeSelectorComponent, ActionIntentSelectorComponent, ActionTextInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './action-input.component.html',
  styleUrl: './action-input.component.scss',
})
export class ActionInputComponent {
  readonly gameState = inject(GameStateService);
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly log = inject(LoggingService);

  readonly actionType = signal<ActionType>('free');
  readonly actionIntent = signal<ActionIntent>('neutral');
  readonly playerText = signal('');

  submit(): void {
    const text = this.playerText().trim();
    if (!text) return;

    const sessionId = this.gameState.sessionId();
    if (!sessionId) return;

    const payload: PlayerActionPayload = {
      actionType: this.actionType(),
      actionIntent: this.actionIntent(),
      playerText: text,
      characterName: this.gameState.playerCharacter()?.name,
    };

    this.log.info('Turno submetido', { actionType: payload.actionType, intent: payload.actionIntent, playerText: text, charName: payload.characterName });

    this.gameState.clearNpcDecisions();
    this.gameState.isLoading.set(true);

    this.api.processTurn(sessionId, payload).subscribe({
      next: (res) => {
        this.gameState.setTurnResult(res);
        this.playerText.set('');
      },
      error: (err) => {
        this.gameState.isLoading.set(false);
        this.gameState.error.set({ message: err.message ?? 'Erro ao processar turno', code: 'TURN_ERROR', timestamp: new Date() });
        this.log.error('Erro ao processar turno', err instanceof Error ? err : new Error(String(err)));
        this.snackBar.open('Erro ao processar turno. Verifique a conexão com o servidor.', 'Fechar', { duration: 5000 });
      },
    });
  }
}

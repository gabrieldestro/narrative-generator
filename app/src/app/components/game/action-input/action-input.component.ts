import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GameStateService } from '../../../core/services/game-state.service';
import { SseService } from '../../../core/services/sse.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ActionTypeSelectorComponent } from './action-type-selector/action-type-selector.component';
import { ActionIntentSelectorComponent } from './action-intent-selector/action-intent-selector.component';
import { ActionTextInputComponent } from './action-text-input/action-text-input.component';
import type { ActionType, ActionIntent, PlayerActionPayload } from '../../../core/models/api-payloads.model';

@Component({
  selector: 'ng-action-input',
  standalone: true,
  imports: [
    MatButtonModule, MatProgressSpinnerModule,
    ActionTypeSelectorComponent, ActionIntentSelectorComponent, ActionTextInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './action-input.component.html',
  styleUrl: './action-input.component.scss',
})
export class ActionInputComponent {
  readonly gameState = inject(GameStateService);
  private readonly sse = inject(SseService);
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

    try {
      this.sse.connectStream(sessionId, payload);
      this.playerText.set(''); // Limpa o campo após envio
    } catch (err) {
      this.log.error('Erro ao processar turno', err instanceof Error ? err : new Error(String(err)));
      this.snackBar.open('Erro ao processar turno. Verifique a conexão com o servidor.', 'Fechar', { duration: 5000 });
    }
  }
}

import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GameStateService } from '../../../core/services/game-state.service';
import { SseService } from '../../../core/services/sse.service';
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
  template: `
    <div class="action-input" role="form" aria-label="Input de ação do jogador">
      <div class="action-input__selectors">
        <ng-action-type-selector (typeChange)="actionType.set($event)"/>
        <ng-action-intent-selector (intentChange)="actionIntent.set($event)"/>
      </div>

      <ng-action-text-input [(text)]="playerText"/>

      <div class="action-input__actions">
        @if (gameState.isStreaming()) {
          <button mat-raised-button disabled aria-label="Aguardando processamento">
            <mat-spinner diameter="20" aria-hidden="true"/>
            Aguardando...
          </button>
        } @else {
          <button
            mat-raised-button
            color="primary"
            (click)="submit()"
            [disabled]="!playerText().trim()"
            aria-label="Enviar ação">
            Agir
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .action-input { padding: 1rem; border-top: 1px solid #333; background: #222; }
    .action-input__selectors { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
    .action-input__actions { display: flex; justify-content: flex-end; margin-top: 0.5rem; }
  `]
})
export class ActionInputComponent {
  readonly gameState = inject(GameStateService);
  private readonly sse = inject(SseService);
  private readonly snackBar = inject(MatSnackBar);

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

    try {
      this.sse.connectStream(sessionId, payload);
    } catch {
      this.snackBar.open('Erro ao processar turno. Verifique a conexão com o servidor.', 'Fechar', { duration: 5000 });
    }
  }
}

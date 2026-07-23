import { Component, inject, ElementRef, viewChild, afterRenderEffect, ChangeDetectionStrategy } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { NarrativeMessageComponent, type NarrativeMessage } from './narrative-message/narrative-message.component';
import { NarrativeStreamComponent } from './narrative-stream/narrative-stream.component';

@Component({
  selector: 'ng-narrative-panel',
  standalone: true,
  imports: [NarrativeMessageComponent, NarrativeStreamComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="narrative-panel" #scrollContainer role="log" aria-label="Painel de narrativa">
      @for (msg of messages(); track msg.text) {
        <ng-narrative-message [message]="msg"/>
      }

      @if (gameState.isStreaming()) {
        <ng-narrative-stream
          [isStreaming]="true"
          [currentText]="gameState.narrativeTokens()"
        />
      }
    </div>
  `,
  styles: [`
    .narrative-panel { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; }
  `]
})
export class NarrativePanelComponent {
  readonly gameState = inject(GameStateService);
  readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  readonly messages = () => {
    const history = this.gameState.history();
    const turnNumber = this.gameState.turnNumber();
    const msgs: NarrativeMessage[] = [];

    if (turnNumber > 1) {
      msgs.push({ type: 'system', text: `Turno ${turnNumber}`, turnNumber });
    }

    for (const entry of history) {
      msgs.push({ type: 'narrative', text: entry });
    }

    return msgs;
  };

  constructor() {
    afterRenderEffect(() => {
      this.gameState.narrativeTokens();
      this.gameState.history();
      const el = this.scrollContainer()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}

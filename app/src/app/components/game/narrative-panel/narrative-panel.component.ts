import { Component, inject, computed, ElementRef, viewChild, afterRenderEffect, ChangeDetectionStrategy } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { NarrativeMessageComponent, type NarrativeMessage } from './narrative-message/narrative-message.component';

@Component({
  selector: 'ng-narrative-panel',
  standalone: true,
  imports: [NarrativeMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './narrative-panel.component.html',
  styleUrl: './narrative-panel.component.scss',
})
export class NarrativePanelComponent {
  readonly gameState = inject(GameStateService);
  readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  readonly messages = computed(() => {
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
  });

  constructor() {
    afterRenderEffect(() => {
      this.messages();
      const el = this.scrollContainer()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}

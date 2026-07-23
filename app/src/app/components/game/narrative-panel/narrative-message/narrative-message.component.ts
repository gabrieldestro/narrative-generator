import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

export type NarrativeMessageType = 'narrative' | 'system' | 'action';

export interface NarrativeMessage {
  type: NarrativeMessageType;
  text: string;
  turnNumber?: number;
}

@Component({
  selector: 'ng-narrative-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (message.type) {
      @case ('system') {
        <div class="narrative-message narrative-message--system fade-in" role="status">
          — {{ message.text }} —
        </div>
      }
      @case ('action') {
        <div class="narrative-message narrative-message--action fade-in" aria-label="Ação do jogador">
          {{ message.text }}
        </div>
      }
      @default {
        <div class="narrative-message narrative-message--narrative fade-in" aria-label="Narrativa">
          {{ message.text }}
        </div>
      }
    }
  `,
  styles: [`
    .narrative-message { margin-bottom: 1rem; }
    .narrative-message--system { font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; color: #8a7a3a; text-align: center; }
    .narrative-message--action { font-size: 1rem; color: #a0a0a0; font-style: italic; }
    .narrative-message--narrative { font-family: Georgia, Merriweather, serif; font-size: 1.125rem; line-height: 1.75; color: #e0e0e0; max-width: 72ch; }
  `]
})
export class NarrativeMessageComponent {
  @Input({ required: true }) message!: NarrativeMessage;
}

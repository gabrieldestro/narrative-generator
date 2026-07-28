import { Component, input, ChangeDetectionStrategy } from '@angular/core';

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
  templateUrl: './narrative-message.component.html',
  styleUrl: './narrative-message.component.scss',
})
export class NarrativeMessageComponent {
  // input() signal com required: true — equivalente a @Input({ required: true })
  readonly message = input.required<NarrativeMessage>();
}

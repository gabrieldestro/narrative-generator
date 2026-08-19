import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { ActionIntent } from '../../../../core/models/api-payloads.model';

interface ActionIntentOption {
  label: string;
  value: ActionIntent;
}

const ACTION_INTENTS: ActionIntentOption[] = [
  { label: 'Curioso', value: 'curious' },
  { label: 'Agressivo', value: 'aggressive' },
  { label: 'Cauteloso', value: 'cautious' },
  { label: 'Amigável', value: 'friendly' },
  { label: 'Intimidador', value: 'intimidating' },
  { label: 'Desesperado', value: 'desperate' },
  { label: 'Neutro', value: 'neutral' },
];

@Component({
  selector: 'ng-action-intent-selector',
  standalone: true,
  imports: [MatSelectModule, MatFormFieldModule],
  templateUrl: './action-intent-selector.component.html',
  styleUrl: './action-intent-selector.component.scss',
})
export class ActionIntentSelectorComponent {
  @Input() disabled = false;
  readonly options = ACTION_INTENTS;
  value: ActionIntent = 'neutral';

  @Output() intentChange = new EventEmitter<ActionIntent>();

  onChange(val: ActionIntent): void {
    this.value = val;
    this.intentChange.emit(val);
  }
}

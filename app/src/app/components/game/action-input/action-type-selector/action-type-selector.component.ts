import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { ActionType } from '../../../../core/models/api-payloads.model';

interface ActionTypeOption {
  label: string;
  value: ActionType;
}

const ACTION_TYPES: ActionTypeOption[] = [
  { label: 'Observar', value: 'observe' },
  { label: 'Falar', value: 'speak' },
  { label: 'Atacar', value: 'attack' },
  { label: 'Furtividade', value: 'sneak' },
  { label: 'Usar Item', value: 'use_item' },
  { label: 'Interagir', value: 'interact' },
  { label: 'Fugir', value: 'flee' },
  { label: 'Livre', value: 'free' },
];

@Component({
  selector: 'ng-action-type-selector',
  standalone: true,
  imports: [MatSelectModule, MatFormFieldModule],
  templateUrl: './action-type-selector.component.html',
  styleUrl: './action-type-selector.component.scss',
})
export class ActionTypeSelectorComponent {
  @Input() disabled = false;
  readonly options = ACTION_TYPES;
  value: ActionType = 'free';

  @Output() typeChange = new EventEmitter<ActionType>();

  onChange(val: ActionType): void {
    this.value = val;
    this.typeChange.emit(val);
  }
}

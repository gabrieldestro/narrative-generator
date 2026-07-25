import { Component, Input, Output, EventEmitter, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'ng-action-text-input',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './action-text-input.component.html',
  styleUrl: './action-text-input.component.scss',
})
export class ActionTextInputComponent {
  @Input() disabled = false;
  readonly text = model('');

  @Output() textChange = new EventEmitter<string>();

  onInput(val: string): void {
    this.text.set(val);
    this.textChange.emit(val);
  }
}

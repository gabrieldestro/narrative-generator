import { Component, Input, model, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'ng-action-text-input',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './action-text-input.component.html',
  styleUrl: './action-text-input.component.scss',
})
export class ActionTextInputComponent {
  @Input() disabled = false;
  // model() já gera automaticamente o evento 'textChange' para two-way binding [(text)]="..."
  readonly text = model('');
}

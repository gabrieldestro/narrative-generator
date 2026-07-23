import { Component, Output, EventEmitter, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'ng-action-text-input',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="fill" class="action-text-input">
      <mat-label>O que você faz?</mat-label>
      <textarea
        matInput
        [ngModel]="text()"
        (ngModelChange)="onInput($event)"
        rows="2"
        placeholder="Descreva sua ação..."
      ></textarea>
    </mat-form-field>
  `,
  styles: [`
    .action-text-input { width: 100%; }
  `]
})
export class ActionTextInputComponent {
  readonly text = model('');

  @Output() textChange = new EventEmitter<string>();

  onInput(val: string): void {
    this.text.set(val);
    this.textChange.emit(val);
  }
}

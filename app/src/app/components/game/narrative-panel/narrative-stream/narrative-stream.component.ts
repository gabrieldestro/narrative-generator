import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'ng-narrative-stream',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './narrative-stream.component.html',
  styleUrl: './narrative-stream.component.scss',
})
export class NarrativeStreamComponent {
  // Usa input() signal em vez de @Input() decorator (API moderna do Angular)
  readonly isStreaming = input(false);
  readonly currentText = input('');
}

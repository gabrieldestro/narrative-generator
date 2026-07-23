import { Component, Input } from '@angular/core';

@Component({
  selector: 'ng-narrative-stream',
  standalone: true,
  template: `
    @if (isStreaming) {
      <div class="narrative-stream">
        <span class="narrative-stream__text">{{ currentText }}</span>
        <span class="narrative-stream__cursor">▊</span>
      </div>
    }
  `,
  styles: [`
    .narrative-stream { font-family: Georgia, Merriweather, serif; font-size: 1.125rem; line-height: 1.75; color: #e0e0e0; max-width: 72ch; margin-bottom: 1rem; }
    .narrative-stream__cursor { animation: blink 0.8s step-end infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  `]
})
export class NarrativeStreamComponent {
  @Input() isStreaming = false;
  @Input() currentText = '';
}

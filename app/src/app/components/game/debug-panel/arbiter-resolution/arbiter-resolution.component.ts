import { Component, Input } from '@angular/core';

@Component({
  selector: 'ng-arbiter-resolution',
  standalone: true,
  template: `
    <div class="arbiter-resolution">
      <h4 class="section-title">ÁRBITRO</h4>
      @if (!resolution) {
        <p class="arbiter-resolution__empty">Aguardando...</p>
      } @else {
        <div class="arbiter-resolution__text">{{ resolution }}</div>
        @if (unexpectedEvent) {
          <div class="arbiter-resolution__unexpected">
            ✦ Evento Inesperado!
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .arbiter-resolution { padding: 0.75rem; }
    .arbiter-resolution__empty { color: #666; font-size: 0.875rem; text-align: center; }
    .arbiter-resolution__text { font-size: 0.875rem; color: #e0e0e0; line-height: 1.5; }
    .arbiter-resolution__unexpected { margin-top: 0.5rem; padding: 0.5rem; background: rgba(255,152,0,0.15); color: #ff9800; border-radius: 4px; font-size: 0.875rem; font-weight: 600; text-align: center; }
  `]
})
export class ArbiterResolutionComponent {
  @Input() resolution: string | null = null;
  @Input() unexpectedEvent = false;
}

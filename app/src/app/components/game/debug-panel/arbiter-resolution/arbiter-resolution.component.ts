import { Component, Input, inject } from '@angular/core';
import { GameStateService } from '../../../../core/services/game-state.service';

@Component({
  selector: 'ng-arbiter-resolution',
  standalone: true,
  templateUrl: './arbiter-resolution.component.html',
  styleUrl: './arbiter-resolution.component.scss'
})
export class ArbiterResolutionComponent {
  @Input() resolution: string | null = null;
  @Input() unexpectedEvent = false;
  readonly gameState = inject(GameStateService);
}

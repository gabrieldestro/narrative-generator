import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import type { MicroQueueEntry, QueueStatus } from '../../../core/models/micro-turn.model';

export type TurnQueueLayout = 'strip' | 'list';

const STATUS_ICON: Record<QueueStatus, string> = {
  done: '✓',
  ignored: '○',
  denied: '✗',
};

const STATUS_LABEL: Record<QueueStatus, string> = {
  done: 'agiu',
  ignored: 'não reagiu',
  denied: 'não percebeu',
};

const CHANNEL_LABEL: Record<string, string> = {
  saw: 'viu',
  heard: 'ouviu',
  stake: 'stake',
};

// Doc 27, Fase 5 (§7.3): fila de turno na tela — ordem dos NPCs, quem
// agiu/age e quem é o próximo. Só renderiza a ordem que o servidor enviou
// (sem lógica de ordenação no front). Limite honesto do MVP: sem "agindo
// AGORA" ao vivo (exige streaming, futuro).
@Component({
  selector: 'ng-turn-queue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turn-queue.component.html',
  styleUrl: './turn-queue.component.scss',
})
export class TurnQueueComponent {
  @Input() layout: TurnQueueLayout = 'strip';

  readonly gameState = inject(GameStateService);

  statusIcon(status: QueueStatus): string {
    return STATUS_ICON[status];
  }

  statusLabel(entry: MicroQueueEntry): string {
    // [0] = foco (ator do micro).
    const block = this.gameState.selectedBlock();
    const isSpotlight = block !== null && entry.who === block.spotlight;
    if (isSpotlight) return 'foco';
    return STATUS_LABEL[entry.status];
  }

  channelLabel(who: string): string | null {
    const block = this.gameState.selectedBlock();
    const allowed = block?.gate.allowed.find(a => a.who === who);
    if (!allowed) return null;
    return CHANNEL_LABEL[allowed.channel] ?? allowed.channel;
  }

  deniedWhy(who: string): string | null {
    const block = this.gameState.selectedBlock();
    return block?.gate.denied.find(d => d.who === who)?.why ?? null;
  }
}

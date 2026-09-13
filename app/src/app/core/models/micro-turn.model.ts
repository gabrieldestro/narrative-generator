// Doc 27, Fase 5 (§7.3) — fila de turno e trace (espelho do backend).
// O front só renderiza a ordem que o servidor enviou; sem lógica de ordenação.

export type GateChannel = 'saw' | 'heard' | 'stake' | 'none';

export type QueueStatus = 'done' | 'ignored' | 'denied';

export interface MicroQueueEntry {
  who: string;
  where: string;
  status: QueueStatus;
}

export interface MicroBlock {
  micro: number;
  actor: string;
  actorWhere: string;
  queue: MicroQueueEntry[];
  spotlight: string;
  gate: {
    allowed: { who: string; channel: Exclude<GateChannel, 'none'> }[];
    denied: { who: string; why: string }[];
  };
}

export interface ActionEvent {
  seq: number;
  turn: number;
  who: string;
  did: string;
  outcome: 'success' | 'partial' | 'failure';
  where: string;
}

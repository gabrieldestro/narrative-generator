// Fila de turno e trace (espelho do backend).
// O front só renderiza a ordem que o servidor enviou; sem lógica de ordenação.

export type GateChannel = 'saw' | 'heard' | 'stake' | 'none';

export type QueueStatus = 'done' | 'ignored' | 'denied';

export interface StepQueueEntry {
  who: string;
  where: string;
  status: QueueStatus;
}

export interface TurnStep {
  step: number;
  actor: string;
  actorWhere: string;
  queue: StepQueueEntry[];
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

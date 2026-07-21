import type { PlayerActionPayload, ActionType, ActionIntent } from "../domain/types.js";

const ACTION_TYPE_DESCRIPTIONS: Record<ActionType, string | null> = {
  observe: "O personagem para e analisa atentamente a situação",
  speak: "O personagem se dirige a alguém",
  attack: "O personagem parte para uma ação de combate ou ataque",
  sneak: "O personagem tenta agir de forma furtiva e sem ser notado",
  use_item: "O personagem utiliza um item de seu inventário",
  interact: "O personagem tenta interagir ou manipular um elemento do ambiente",
  flee: "O personagem busca uma rota de fuga ou recuo",
  free: null,
};

const ACTION_INTENT_DESCRIPTIONS: Record<ActionIntent, string | null> = {
  curious: "com genuína curiosidade",
  aggressive: "com hostilidade clara",
  cautious: "de forma cautelosa e avaliando os riscos",
  friendly: "de maneira amigável e cordial",
  intimidating: "tentando intimidar ou pressionar",
  desperate: "em desespero, sem ponderar consequências",
  neutral: null,
};

export class ActionBuilderService {
  public static buildActionString(payload: PlayerActionPayload): string {
    const actionType = payload.actionType || 'free';
    const actionIntent = payload.actionIntent || 'neutral';
    const typeDesc = ACTION_TYPE_DESCRIPTIONS[actionType];
    const intentDesc = ACTION_INTENT_DESCRIPTIONS[actionIntent];
    const playerText = payload.playerText.trim();

    if (actionType === 'free' && actionIntent === 'neutral') {
      return playerText;
    }

    const parts: string[] = [];

    if (typeDesc) {
      parts.push(typeDesc);
    }

    if (intentDesc) {
      parts.push(intentDesc);
    }

    if (parts.length === 0) {
      return playerText;
    }

    const contextPrefix = parts.join(" ");
    return `${contextPrefix}: "${playerText}"`;
  }
}

import { DEFAULT_SETTINGS, type GameSettings } from '../../domain/types.js';
import type { TurnService } from '../turn/TurnService.js';
import type { LlmService } from '../shared/LlmService.js';
import type { CharacterService } from '../characters/CharacterService.js';

/**
 * Ramo de serviços de UMA campanha (F2, doc 31): cada escopo tem seu
 * orquestrador + `LlmService` + `CharacterService` construídos com os
 * settings da campanha. Services continuam singletons como código, mas o
 * estado (settings + snapshots) vive aqui, chaveado por `rootId`.
 *
 * Por que um grafo por escopo em vez de `settings` por parâmetro: os
 * agentes (`TurnService`, `NarratorService`, `SelfHealingService`,
 * `StructuredResolver`, `LlmService` interno…) guardam snapshots da
 * construção em ~10 pontos. Re-passar `settings` em cada chamada tocaria
 * ~15 arquivos e cada call-site; o grafo por escopo isola sem churn e sem
 * risco de um snapshot esquecido vazar entre campanhas. Custo: ~10
 * alocações pequenas por campanha (sem I/O) — irrelevante perto de 1 LLM.
 */
export interface ScopeGraph {
  orchestrator: TurnService;
  llmService: LlmService;
  characterService: CharacterService;
}

export interface SessionScope {
  rootId: string;
  settings: GameSettings;
  /** Ausente quando o store foi criado sem factory (ex.: testes unitários) —
   * o `GameService` cai para o trio legado nesses casos. */
  graph?: ScopeGraph | undefined;
  updatedAt: number;
}

export type ScopeGraphFactory = (settings: GameSettings) => ScopeGraph;

export interface ScopeStoreOptions {
  /** TTL sem uso para `prune()` (defensivo; ver nota em `prune`). */
  ttlMs?: number;
  /** Teto de campanhas em memória para `prune()`. */
  maxScopes?: number;
}

/**
 * Settings de gameplay por campanha (F2: elimina R2/R3).
 *
 * - Chave = `rootId` da campanha (checkpoints filhos resolvem para a raiz
 *   via `CheckpointService.resolveRootId` — 1 escopo por campanha).
 * - `update()` é merge SÍNCRONO (read+spread+write sem `await` no meio):
 *   2 updates concorrentes nunca perdem campo um do outro (R3). O objeto
 *   anterior nunca é mutado (copy-on-write — seguro com `inherit()`).
 * - Sem locks: `Map` puro; código síncrono é atômico no event loop.
 */
export class SessionScopeStore {
  private readonly scopes = new Map<string, SessionScope>();

  constructor(
    private readonly defaults: GameSettings = { ...DEFAULT_SETTINGS },
    private readonly factory?: ScopeGraphFactory,
    private readonly options: ScopeStoreOptions = {},
  ) {}

  /** Escopo da campanha, criando com `fallback ?? defaults` se ausente. */
  getOrCreate(rootId: string, fallback?: GameSettings): SessionScope {
    const existing = this.scopes.get(rootId);
    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }
    const settings = { ...(fallback ?? this.defaults) };
    const scope: SessionScope = {
      rootId,
      settings,
      ...(this.factory ? { graph: this.factory(settings) } : {}),
      updatedAt: Date.now(),
    };
    this.scopes.set(rootId, scope);
    return scope;
  }

  /**
   * Merge de gameplay (R3). Síncrono e copy-on-write: devolve os settings
   * resultantes e reconstrói o grafo da campanha (os snapshots passam a
   * valer de imediato; turnos em voo terminam a fase atual no grafo antigo
   * e resolvem o novo na fase seguinte — mesma semântica do global atual,
   * agora isolada por campanha).
   */
  update(rootId: string, partial: Partial<GameSettings>): GameSettings {
    const prev = this.getOrCreate(rootId);
    const settings = { ...prev.settings, ...partial };
    const scope: SessionScope = {
      rootId,
      settings,
      ...(this.factory ? { graph: this.factory(settings) } : {}),
      updatedAt: Date.now(),
    };
    this.scopes.set(rootId, scope);
    return settings;
  }

  /**
   * Propaga o escopo para o checkpoint filho (mesma campanha). Compartilha
   * a referência — seguro porque `update()` nunca muta, só substitui.
   * Na prática quase sempre desnecessário (filhos resolvem o mesmo `rootId`),
   * mantido para sessões ainda só em memória.
   */
  inherit(childId: string, parentId: string): void {
    if (childId === parentId) return;
    const parent = this.scopes.get(parentId);
    if (!parent) return;
    this.scopes.set(childId, parent);
  }

  evict(rootId: string): void {
    this.scopes.delete(rootId);
  }

  get size(): number {
    return this.scopes.size;
  }

  /**
   * Evicção defensiva (anti-vazamento do singleton). NOTA F2: o `prune`
   * automático só deve ser ligado (timer) após a F4 persistir settings no
   * bundle — hoje evictar perde customizações (reload voltaria a defaults).
   * Até lá, `prune()` é manual/opcional e nunca apaga a última escrita
   * recente: remove por TTL e, acima de `maxScopes`, os mais antigos.
   */
  prune(now = Date.now()): string[] {
    const { ttlMs = Number.POSITIVE_INFINITY, maxScopes = Number.POSITIVE_INFINITY } = this.options;
    const evicted: string[] = [];
    for (const [id, scope] of this.scopes) {
      if (now - scope.updatedAt > ttlMs) {
        this.scopes.delete(id);
        evicted.push(id);
      }
    }
    if (this.scopes.size > maxScopes) {
      const byAge = [...this.scopes.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      for (let i = 0; i < byAge.length - maxScopes; i++) {
        this.scopes.delete(byAge[i]![0]);
        evicted.push(byAge[i]![0]);
      }
    }
    return evicted;
  }
}

/**
 * Benchmark: Simulated Turn Runner
 *
 * Executes N simulated game turns (no user input — player action is hardcoded)
 * and generates a performance report from the llm_calls.jsonl log.
 *
 * Usage:
 *   npx tsx src/benchmark/simulatedTurn.ts [turns=5] [logPath=logs/llm_calls.jsonl]
 *
 * Output:
 *   - Progress in console
 *   - Detailed JSON report written to logs/benchmark_report.json
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { LlmService } from '../application/LlmService.js';
import { CpuReflectionService } from '../application/npcAgent/CpuReflectionService.js';
import { GameManagementService } from '../application/GameManagementService.js';
import { LlmCallLogger } from '../infrastructure/LlmCallLogger.js';
import type { GameState, Character, GameSettings } from '../domain/types.js';
import { DEFAULT_SETTINGS } from '../domain/types.js';

dotenv.config();

// ─── Configuration ───────────────────────────────────────────────────────────

const TURN_COUNT = parseInt(process.argv[2] ?? '5', 10);
const LOG_PATH = process.argv[3] ?? 'logs/benchmark_llm_calls.jsonl';
const REPORT_PATH = 'logs/benchmark_report.json';

// A minimal but realistic world state for simulation
const BENCHMARK_STATE: GameState = {
  narrativeStyle: 'Fantasia Medieval',
  writingStyle: 'Épico e Sombrio',
  worldContext: 'Uma masmorra antiga, cheia de armadilhas e criaturas hostis. Tochas tremulam nas paredes de pedra. Há um odor de enxofre no ar.',
  turnNumber: 1,
  history: [],
  characters: [
    {
      id: 'player-1',
      name: 'Arden',
      description: 'Um guerreiro experiente com armadura de aço envelhecida',
      personality: 'Corajoso, direto, leal à sua missão',
      isPlayer: true,
      currentLocation: 'Entrada da Masmorra',
      inventory: ['espada longa', 'escudo de aço', 'tocha'],
      status: 'active',
    },
    {
      id: 'npc-1',
      name: 'Seraphina',
      description: 'Uma feiticeira de olhos prateados, manto azul-noturno',
      personality: 'Inteligente, calculista, desconfia de todos',
      isPlayer: false,
      longTermObjective: 'Encontrar o artefato proibido no nível mais profundo da masmorra',
      currentObjective: 'Explorar o corredor principal à procura de pistas',
      currentLocation: 'Entrada da Masmorra',
      inventory: ['cajado arcano', 'pergaminho de teleporte'],
      status: 'active',
    },
    {
      id: 'npc-2',
      name: 'Orim',
      description: 'Um anão ladino de barba vermelha, especialista em armadilhas',
      personality: 'Ganancioso, esperto, faz piadas nos momentos errados',
      isPlayer: false,
      longTermObjective: 'Encontrar o tesouro lendário e escapar vivo',
      currentObjective: 'Detectar e desabilitar as armadilhas do corredor',
      currentLocation: 'Corredor Principal',
      inventory: ['ferramentas de ladrão', 'adaga enferrujada', 'lanterna'],
      status: 'active',
    },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface TurnMetrics {
  turn: number;
  totalTurnMs: number;
  npcParallelMs: number;  // Wall-clock time for all NPCs (parallelism benefit visible here)
  arbiterMs: number;
  narratorMs: number;
  postTurnMs: number;     // summarize + worldContext + extractLocations
  npcCallsMs: number[];   // Individual NPC call durations
}

function readLogRecords(logPath: string): any[] {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function buildReport(metrics: TurnMetrics[], logPath: string): object {
  const records = readLogRecords(logPath);

  const avgMs = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const maxMs = (arr: number[]) => arr.length ? Math.max(...arr) : 0;
  const minMs = (arr: number[]) => arr.length ? Math.min(...arr) : 0;

  const turnTotals = metrics.map(m => m.totalTurnMs);
  const arbiterTotals = metrics.map(m => m.arbiterMs);
  const narratorTotals = metrics.map(m => m.narratorMs);
  const npcParallel = metrics.map(m => m.npcParallelMs);
  const postTurns = metrics.map(m => m.postTurnMs);

  // Aggregate by agent from JSONL
  const byAgent: Record<string, { count: number; totalMs: number; errors: number }> = {};
  for (const r of records) {
    if (!byAgent[r.agent]) byAgent[r.agent] = { count: 0, totalMs: 0, errors: 0 };
    byAgent[r.agent]!.count++;
    byAgent[r.agent]!.totalMs += r.durationMs;
    if (r.status === 'error' || r.status === 'retry') byAgent[r.agent]!.errors++;
  }

  const agentSummary = Object.fromEntries(
    Object.entries(byAgent).map(([agent, stats]) => [
      agent,
      {
        callCount: stats.count,
        avgMs: Math.round(stats.totalMs / stats.count),
        errorCount: stats.errors,
        errorRate: `${((stats.errors / stats.count) * 100).toFixed(1)}%`,
      },
    ])
  );

  return {
    generatedAt: new Date().toISOString(),
    configuration: {
      turnsSimulated: metrics.length,
      npcCount: BENCHMARK_STATE.characters.filter(c => !c.isPlayer).length,
    },
    turnSummary: {
      avgTotalMs: avgMs(turnTotals),
      minTotalMs: minMs(turnTotals),
      maxTotalMs: maxMs(turnTotals),
      avgNpcParallelMs: avgMs(npcParallel),
      avgArbiterMs: avgMs(arbiterTotals),
      avgNarratorMs: avgMs(narratorTotals),
      avgPostTurnMs: avgMs(postTurns),
    },
    perTurnDetail: metrics,
    agentBreakdown: agentSummary,
    rawLogPath: logPath,
  };
}

// ─── Simulation ───────────────────────────────────────────────────────────────

async function simulateTurn(
  state: GameState,
  llmService: LlmService,
  cpuService: CpuReflectionService,
  managementService: GameManagementService,
  settings: GameSettings,
): Promise<TurnMetrics> {
  const turnStart = Date.now();

  // ── NPCs in parallel ──────────────────────────────────────────────────────
  const npcChars = state.characters.filter(c => !c.isPlayer && (!c.status || c.status === 'active'));
  const npcStart = Date.now();

  const npcTasks = npcChars.map(char =>
    cpuService.reflectAndAct(state, char)
      .then(d => ({ char, action: d.action }))
      .catch(() => ({ char, action: `${char.name} observa os arredores.` })),
  );
  const npcSettled = await Promise.allSettled(npcTasks);
  const npcParallelMs = Date.now() - npcStart;

  // Build actions list (player hardcoded for benchmark)
  const actions: string[] = [];
  for (const char of state.characters) {
    if (char.status && char.status !== 'active') continue;
    let action: string;
    if (char.isPlayer) {
      action = 'Arden avança cautelosamente pelo corredor, espada em punho, procurando por armadilhas.';
    } else {
      const settled = npcSettled.find(r => r.status === 'fulfilled' && r.value.char.name === char.name);
      action = settled?.status === 'fulfilled' ? settled.value.action : `${char.name} observa os arredores.`;
    }
    const roll = Math.floor(Math.random() * 20) + 1;
    actions.push(`${char.name} tenta: ${action} (Resultado do dado d20: ${roll})`);
  }

  // ── Arbitro ───────────────────────────────────────────────────────────────
  const arbiterStart = Date.now();
  const recentHistory = settings.arbiterHistoryTurns > 0 ? state.history.slice(-settings.arbiterHistoryTurns) : undefined;
  const logicalResolution = await llmService.arbitrateLogic(state, actions, recentHistory, state.longTermSummary);
  const arbiterMs = Date.now() - arbiterStart;

  // Update NPC scratchpads
  for (const char of npcChars) {
    cpuService.recordArbiterResult(char, state.turnNumber, logicalResolution);
  }

  // ── Narrator ─────────────────────────────────────────────────────────────
  const narratorStart = Date.now();
  const outcome = await llmService.narrateFiction(state, actions, logicalResolution);
  const narratorMs = Date.now() - narratorStart;

  state.history.push(`Turno ${state.turnNumber}:\nAções: ${actions.join(' | ')}\nNarrativa: ${outcome}`);

  // ── Post-turn ─────────────────────────────────────────────────────────────
  const postStart = Date.now();
  const stateWithUpdates = await managementService.applyAutomaticStateUpdates(state, outcome);
  state.characters = stateWithUpdates.characters;
  if (stateWithUpdates.locations) state.locations = stateWithUpdates.locations;

  if (state.history.length > settings.memoryWindowSize) {
    const excessCount = state.history.length - settings.memoryWindowSize;
    const oldestTurns = state.history.slice(0, excessCount);
    state.longTermSummary = await llmService.summarizeMemory(state.longTermSummary, oldestTurns, state.turnNumber);
    state.history = state.history.slice(excessCount);
  }

  state.worldContext = await llmService.updateWorldContext(state.worldContext, outcome, state.turnNumber);
  const locations = await llmService.extractCharacterLocations(state, outcome);
  for (const char of state.characters) {
    const loc = locations[char.name];
    if (loc) char.currentLocation = loc;
  }
  const postTurnMs = Date.now() - postStart;

  state.turnNumber++;

  return {
    turn: state.turnNumber - 1,
    totalTurnMs: Date.now() - turnStart,
    npcParallelMs,
    arbiterMs,
    narratorMs,
    postTurnMs,
    npcCallsMs: [],  // Individual call durations come from JSONL
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎲 Benchmark: ${TURN_COUNT} turno(s) simulado(s) | Log: ${LOG_PATH}\n`);

  // Clean up previous benchmark log for a fresh run
  if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);

  const llm = new ChatOpenAI({
    temperature: 0.7,
    model: process.env.LLM_MODEL ?? 'gemma-4b',
    apiKey: process.env.OPENAI_API_KEY ?? 'lm-studio',
    configuration: {
      baseURL: process.env.OPENAI_API_BASE ?? 'http://localhost:1234/v1',
    },
  });

  const logger = new LlmCallLogger(LOG_PATH);
  const settings: GameSettings = { ...DEFAULT_SETTINGS, narrationSize: 'concise' };
  const llmService = new LlmService(llm, settings, logger);
  const cpuService = new CpuReflectionService(llmService, settings);
  const managementService = new GameManagementService(llmService);

  // Deep-copy state so re-runs start fresh
  const state: GameState = JSON.parse(JSON.stringify(BENCHMARK_STATE));
  const allMetrics: TurnMetrics[] = [];

  for (let i = 1; i <= TURN_COUNT; i++) {
    console.log(`  ▶ Turno ${i}/${TURN_COUNT}...`);
    const metrics = await simulateTurn(state, llmService, cpuService, managementService, settings);
    allMetrics.push(metrics);
    console.log(
      `    ✓ Total: ${metrics.totalTurnMs}ms | NPCs(paralelo): ${metrics.npcParallelMs}ms | Árbitro: ${metrics.arbiterMs}ms | Narrador: ${metrics.narratorMs}ms | Pós-turno: ${metrics.postTurnMs}ms`,
    );
  }

  // ── Generate report ────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const report = buildReport(allMetrics, LOG_PATH);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\n📊 Relatório salvo em: ${REPORT_PATH}`);
  console.log(`📋 Log detalhado em:   ${LOG_PATH}`);

  // Print quick summary
  const r = report as any;
  console.log('\n─── Resumo de Performance ──────────────────────────────────');
  console.log(`  Turnos simulados : ${r.configuration.turnsSimulated}`);
  console.log(`  Média por turno  : ${r.turnSummary.avgTotalMs}ms`);
  console.log(`  NPCs (paralelo)  : ${r.turnSummary.avgNpcParallelMs}ms`);
  console.log(`  Árbitro          : ${r.turnSummary.avgArbiterMs}ms`);
  console.log(`  Narrador         : ${r.turnSummary.avgNarratorMs}ms`);
  console.log(`  Pós-turno        : ${r.turnSummary.avgPostTurnMs}ms`);
  console.log('────────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('Erro fatal no benchmark:', err);
  process.exit(1);
});

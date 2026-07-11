# Gerador Narrativo com IA

Motor narrativo de RPG multi-agentes (Narrador, Árbitro, NPCs) em Node.js + TypeScript, rodando LLMs locais via LM Studio.

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js + TypeScript ESM |
| Compilação | `tsx` (TypeScript Execute) |
| Pacotes | npm / `package.json` |
| Testes | Vitest |
| IA | LangChain (`@langchain/openai`) |

## Arquitetura (Clean Architecture / Ports & Adapters)

```
src/
├── domain/                     # Entidades e interfaces (Ports)
│   ├── types.ts                # WorldConfig, WorldTemplate, GameState, Character
│   └── ports.ts                # IUserInput, IOutputWriter
├── application/                # Casos de uso
│   ├── GameEngine.ts           # Loop principal do jogo
│   ├── GameManagementService.ts# Mutações de estado (inventário, personagens, locais)
│   ├── LlmService.ts           # Integração com LLM (narrador, árbitro, extração)
│   ├── SessionFactory.ts       # Setup de novo jogo (template ou custom)
│   ├── prompts.ts              # Templates de prompt para todos os agentes
│   ├── npcAgent/
│   │   ├── CpuReflectionService.ts   # Decisão autônoma dos NPCs
│   │   ├── CpuAgentPrompts.ts        # Prompts do agente NPC
│   │   ├── SceneContext.ts           # Helper de cena (local + personagens presentes)
│   │   └── __tests__/
│   └── __tests__/
│       ├── integration/
│       └── e2e/
├── infrastructure/             # Adaptadores concretos (Adapters)
│   ├── ConsoleInput.ts
│   ├── ConsoleOutput.ts
│   ├── JsonStateRepository.ts
│   ├── WorldTemplateRepository.ts
│   └── __tests__/
├── worlds/                     # Templates de mundo pré-configurados (JSON)
└── index.ts                    # Composition Root (DI)
```

### Injeção de Dependência

O `GameEngine` recebe tudo por construtor — nada de `new` dentro da classe:

```typescript
constructor(
  private readonly input: IUserInput,
  private readonly output: IOutputWriter,
  private readonly repository: IStateRepository,
  private readonly llm: ChatOpenAI,
  private readonly worldTemplateRepo?: WorldTemplateRepository  // opcional
) {}
```

Isso é o **Dependency Inversion Principle** do SOLID: o domínio (`domain/ports.ts`) define as abstrações, a infraestrutura as implementa (`ConsoleInput`, `ConsoleOutput`), e o motor (`GameEngine`) só conhece as interfaces.

## Como Executar

1. Abra o **LM Studio**, carregue o modelo (ex: Gemma 4B Instruct) e inicie o servidor na porta **1234**.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Execute:
   ```bash
   npm start
   ```

## Testes

O projeto possui três níveis de testes, cada um com seu próprio comando e configuração:

```
vitest.config.ts              # Unitários (excluí integration e e2e)
vitest.integration.config.ts  # Integração com LLM real (~5-10min)
vitest.e2e.config.ts          # End-to-End com múltiplos turnos (~10min)
```

### Comandos

```bash
npm test                   # Unitários (rápido, ~1-2s, sem LLM)
npm run test:watch         # Modo watch (desenvolvimento)
npm run test:coverage      # Unitários + relatório de cobertura HTML
npm run test:integration   # Integração com LLM real (requer LM Studio)
npm run test:e2e           # Suite E2E completa (requer LM Studio)
```

### Cobertura

Gera relatório HTML em `coverage/index.html` e resumo no terminal:

```bash
npm run test:coverage
```

### Rodar testes de integração individualmente

```bash
# Apenas testes do Árbitro
npx vitest run --config vitest.integration.config.ts arbiter

# Apenas testes do pipeline NPC → Árbitro → Narrador
npx vitest run --config vitest.integration.config.ts pipeline

# Apenas testes de extração de localização
npx vitest run --config vitest.integration.config.ts location

# Apenas testes de mudanças de estado (inventário, novos NPCs, locais)
npx vitest run --config vitest.integration.config.ts stateChanges

# Apenas testes de limite de token na narração
npx vitest run --config vitest.integration.config.ts narration.tokenLimit
```

**Nota:** Os testes de integração e E2E exigem o LM Studio rodando em `http://localhost:1234`. Pule com `SKIP_LMSTUDIO_CHECK=1`.

### O que cobre

**Unitários (50 testes):**
| Arquivo | Testes | O que valida |
|---------|--------|-------------|
| `GameEngine.test.ts` | 3 | Ciclo completo, save/load, sumarização, extração de local |
| `GameManagementService.test.ts` | 5 | Mutações de inventário, status, auto-update de estado |
| `SessionFactory` (no mesmo arquivo) | 8 | Criação de jogo, personagens, propagação de `initialLocation` |
| `CpuReflectionService.test.ts` | 14 | Parse JSON, retry, scratchpad |
| `SceneContext.test.ts` | 6 | Agrupamento por local, descrição de cena |
| `JsonStateRepository.test.ts` | 4 | Save/load, integridade |
| `WorldTemplateRepository.test.ts` | 8 | Leitura de diretório, fallbacks, JSONs reais |

**Integração com LLM real:**
| Cenário | Arquivo | Descrição |
|---------|---------|-----------|
| Pipeline multi-agente | `pipeline.integration.test.ts` | NPC→Árbitro→Narrador (Cyberpunk, Fantasia, Terror) |
| Memória narrativa | `memory.integration.test.ts` | Sumarização e update de contexto do mundo |
| Extração de localização | `location.extraction.integration.test.ts` | Movimento individual, mesmo local, todos juntos, destinos diferentes |
| Reflexão de NPC | `arbiter.integration.test.ts` | Cyberpunk e Fantasia com scratchpad |
| Mudanças de estado | `stateChanges.integration.test.ts` | Extração de inventário, novos NPCs e locais pela narrativa |
| Limite de token | `narration.tokenLimit.integration.test.ts` | Sumarização automática quando o histórico cresce |

**End-to-End (E2E):**
| Cenário | Arquivo | Descrição |
|---------|---------|-----------|
| Coerência multi-turno | `narration.e2e.test.ts` | Fluxo de 2 turnos completos (Mansão Blackwood) com avaliação por LLM Juiz: valida consistência de ações, autonomia de NPCs, extração dinâmica de estado e emite veredito `APROVADO`/`REPROVADO`. Salva relatório em `test-output/`. Timeout: 10 minutos. |

> **Dica:** Os relatórios E2E são gravados em `test-output/` no formato  
> `<timestamp>_e2e_narration_complex_coherence.md` e incluem métricas de performance por turno e o parecer do LLM Juiz.

## Próximos Passos (Roadmap)

1. CLI & Core refinado (atual)
2. API com Fastify
3. Front-end Angular
4. Banco NoSQL + Memória longa (ChromaDB)

Veja `docs/` para o detalhamento de cada fase.

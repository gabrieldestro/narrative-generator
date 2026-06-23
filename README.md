# Gerador Narrativo com IA

Motor narrativo de RPG multi-agentes (Narrador, Árbitro, NPCs) em Node.js + TypeScript, rodando LLMs locais via LM Studio.

## Stack Tecnológica

| Camada | Tecnologia | Paralelo C# |
|---|---|---|
| Runtime | Node.js + TypeScript ESM | .NET runtime + C# |
| Compilação | `tsx` (TypeScript Execute) | `dotnet run` |
| Pacotes | npm / `package.json` | NuGet / `.csproj` |
| Testes | Vitest | xUnit + Moq |
| IA | LangChain (`@langchain/openai`) | --- |

## Arquitetura (Clean Architecture / Ports & Adapters)

```
src/
├── domain/                   # Entidades e interfaces (Ports)
│   ├── types.ts              # WorldConfig, WorldTemplate, GameState, Character
│   ├── ports.ts              # IUserInput, IOutputWriter
│   └── (__tests__/)
├── application/              # Casos de uso (GameEngine)
│   ├── GameEngine.ts
│   ├── prompts.ts
│   └── __tests__/
│       ├── GameEngine.test.ts
│       └── LlmIntegration.integration.test.ts
├── infrastructure/           # Adaptadores concretos (Adapters)
│   ├── ConsoleInput.ts
│   ├── ConsoleOutput.ts
│   ├── JsonStateRepository.ts
│   ├── WorldTemplateRepository.ts
│   └── __tests__/
│       ├── JsonStateRepository.test.ts
│       └── WorldTemplateRepository.test.ts
└── index.ts                  # Composition Root (DI)
```

**Paralelo C#:** Essa estrutura é idêntica a um projeto .NET com pastas `Domain/`, `Application/`, `Infrastructure/`. O `index.ts` faz o papel do **Composition Root** (equivalente ao `Program.cs` que registra serviços no DI container).

### Injeção de Dependência

O `GameEngine` recebe tudo por construtor — nada de `new` dentro da classe:

```typescript
// C# equivalente: public GameEngine(IUserInput input, IOutputWriter output, ...)
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

```bash
npm test                # Unitários + Repositório (rápido ~1s)
npm run test:watch      # Modo watch (desenvolvimento)
npm run test:integration  # LLM real (requer LM Studio rodando, ~2min)
```

### O que cobre

- **Unitários (7 testes):** `application/__tests__/GameEngine.test.ts` — mocks de `IUserInput`, `IOutputWriter`, `IStateRepository` e `ChatOpenAI`. Nenhum `vi.mock()` de módulo do Node, apenas objetos planos.
- **Infraestrutura (12 testes):** `infrastructure/__tests__/JsonStateRepository.test.ts` (4 — arquivo real) + `WorldTemplateRepository.test.ts` (8 — templates `worlds/`).
- **LLM-as-a-Judge (3 cenários):** `application/__tests__/LlmIntegration.integration.test.ts` — pipeline NPC→Árbitro→Narrador com chamadas reais ao LM Studio. Excluído do `npm test` padrão (config separada `vitest.integration.config.ts`).

**Paralelo C#:** Os mocks com `vi.fn()` são o equivalente a `Mock<IUserInput>.Setup(x => x.Question(...)).ReturnsAsync(...)` do Moq. A diferença é que no Vitest os mocks são objetos literais, sem necessidade de uma biblioteca separada como Moq/NSubstitute — o próprio test runner já fornece `vi.fn()`.

## Próximos Passos (Roadmap)

1. CLI & Core refinado (atual)
2. API com Fastify
3. Front-end Angular
4. Banco NoSQL + Memória longa (ChromaDB)

Veja `docs/` para o detalhamento de cada fase e paralelos com o ecossistema C#.

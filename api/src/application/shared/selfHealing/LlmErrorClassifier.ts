export type LlmErrorKind =
  | 'context_overflow'
  | 'rate_limit'
  | 'server_error'
  | 'json_expected'
  | 'unknown';

const CONTEXT_OVERFLOW_PATTERNS = [
  'maximum context length',
  'context length exceeded',
  'context length',
  'context window',
  'context overflow',
  'contexto máximo',
  'contexto excedido',
  'contexto estourado',
  'too many tokens',
  'max context',
  'muitos tokens',
  'limite de contexto',
  'exceeded the context',
  'exceeds the model',
  'n_ctx',
  'n_keep',
  'prompt is too long',
  'reduce the length of the messages',
  'request too large',
  'entrada muito longa',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  '429',
  'limite de requisições',
];

const SERVER_ERROR_PATTERNS = [
  '500',
  '502',
  '503',
  '504',
  'internal server error',
  'service unavailable',
  'erro interno',
  'serviço indisponível',
];

const JSON_EXPECTED_PATTERNS = [
  'json expected',
  'expected json',
  'invalid json',
  'json inválido',
  'parse error',
  'could not parse json',
];

export function classifyLlmError(err: unknown): LlmErrorKind {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  const matchesAny = (patterns: string[]) => patterns.some(p => normalized.includes(p));

  if (matchesAny(CONTEXT_OVERFLOW_PATTERNS)) {
    return 'context_overflow';
  }
  if (matchesAny(RATE_LIMIT_PATTERNS)) {
    return 'rate_limit';
  }
  if (matchesAny(SERVER_ERROR_PATTERNS)) {
    return 'server_error';
  }
  if (matchesAny(JSON_EXPECTED_PATTERNS)) {
    return 'json_expected';
  }

  const httpCode = normalized.match(/status(?: code)?[:\s]+(\d{3})/)?.[1] ?? normalized.match(/(?:^|\s)(\d{3})\s/)?.[1];
  if (httpCode === '400' || httpCode === '413') {
    return 'context_overflow';
  }

  return 'unknown';
}

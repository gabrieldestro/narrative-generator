/**
 * slugify compartilhado (dono único).
 * `worldNormalizer.ts` importa daqui em vez de duplicar.
 * `worldNormalizer.ts` importa daqui em vez de duplicar.
 * Corrige bug herdado: o regex de diacríticos estava com encoding
 * corrompido (`/[̀-ͯ]/g`), gerando `Sótão -> so-ta-o`.
 */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'id'
  );
}

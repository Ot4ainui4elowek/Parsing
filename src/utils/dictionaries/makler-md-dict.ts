/**
 * Словарь специальностей makler.md
 * Используем существующий MAKLER_PROFESSIONS
 */

import { MAKLER_PROFESSIONS } from '../../parsers/maklerMd.js';

export async function parseMaklerMdDictionary() {
  console.log('🔍 Получение словаря специальностей makler.md...');

  const professions = Object.entries(MAKLER_PROFESSIONS).map(([profession, professionId]) => ({
    profession,
    professionId: professionId.toString(),
    category: undefined // Можно определить по группам
  }));

  console.log(`✅ Получено ${professions.length} специальностей с makler.md`);

  return professions;
}

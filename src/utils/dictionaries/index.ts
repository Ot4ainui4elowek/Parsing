/**
 * Утилита для парсинга и обновления словариков специальностей
 * Запускается раз в неделю (можно через cron или вручную)
 */

import { parseRabotaMdJobs } from './rabota-md-dict.js';
import { parseNineNineNineMdDictionary } from './999-md-dict.js';
import { parseMaklerMdDictionary } from './makler-md-dict.js';
import { professionDictionaryService } from '../../api/services/profession-dictionary.service.js';

/**
 * Обновить все словарики
 */
export async function updateAllDictionaries() {
  console.log('🚀 Начинаю обновление словариков специальностей...\n');

  const sources = [
    { name: 'rabota.md', parser: parseRabotaMdJobs },
    { name: '999.md', parser: parseNineNineNineMdDictionary },
    { name: 'makler.md', parser: parseMaklerMdDictionary }
  ];

  for (const { name, parser } of sources) {
    try {
      console.log(`📋 Обновление ${name}...`);
      
      const professions = await parser();
      
      if (professions.length > 0) {
        await professionDictionaryService.saveProfessions(name, professions);
      } else {
        console.log(`   ⚠️  Не удалось получить специальности для ${name}`);
      }

      console.log('');
    } catch (error) {
      console.error(`❌ Ошибка при обновлении ${name}:`, error);
    }
  }

  console.log('✅ Обновление словариков завершено\n');

  // Показываем статистику
  const stats = await professionDictionaryService.getStats();
  console.log('📊 Статистика словариков:');
  stats.forEach(s => {
    console.log(`   ${s.source}: ${s.count} специальностей (обновлено: ${s.lastUpdated?.toLocaleString() || 'никогда'})`);
  });
}

/**
 * Обновить словарик для одного источника
 */
export async function updateDictionary(source: 'rabota.md' | '999.md' | 'makler.md') {
  console.log(`🚀 Обновление словарика для ${source}...\n`);

  let parser: () => Promise<any[]>;

  switch (source) {
    case 'rabota.md':
      parser = parseRabotaMdJobs;
      break;
    case '999.md':
      parser = parseNineNineNineMdDictionary;
      break;
    case 'makler.md':
      parser = parseMaklerMdDictionary;
      break;
  }

  try {
    const professions = await parser();
    
    if (professions.length > 0) {
      await professionDictionaryService.saveProfessions(source, professions);
      console.log(`✅ Словарик ${source} обновлен (${professions.length} специальностей)`);
    } else {
      console.log(`⚠️  Не удалось получить специальности для ${source}`);
    }
  } catch (error) {
    console.error(`❌ Ошибка при обновлении ${source}:`, error);
  }
}

// Если запускается напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  updateAllDictionaries()
    .then(() => {
      console.log('\n🎉 Готово!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка:', error);
      process.exit(1);
    });
}

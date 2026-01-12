/**
 * Парсер словаря специальностей с 999.md
 */

import puppeteer from 'puppeteer';

export async function parseNineNineNineMdDictionary() {
  console.log('🔍 Парсинг словаря специальностей с 999.md...');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    // Переходим на главную страницу работы
    await page.goto('https://999.md/ru/category/work', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Ждем загрузки подкатегорий
    await page.waitForSelector('a[data-subcategory]', {
      timeout: 10000
    });

    // Извлекаем подкатегории (специальности)
    const professions = await page.evaluate(() => {
      const results: Array<{
        profession: string;
        professionId?: string;
        category?: string;
      }> = [];

      const links = document.querySelectorAll('a[data-subcategory]');

      links.forEach(link => {
        const text = link.textContent?.trim();
        const subcategoryId = link.getAttribute('data-subcategory');

        if (text && text !== 'Все объявления') {
          results.push({
            profession: text,
            professionId: subcategoryId || undefined,
            category: 'Работа' // Общая категория
          });
        }
      });

      return results;
    });

    console.log(`✅ Найдено ${professions.length} специальностей с 999.md`);

    await browser.close();
    return professions;

  } catch (error) {
    console.error('❌ Ошибка при парсинге 999.md:', error);
    await browser.close();
    return [];
  }
}

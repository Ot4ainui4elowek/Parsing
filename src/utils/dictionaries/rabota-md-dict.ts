import puppeteer from 'puppeteer';

export async function parseRabotaMdJobs() {
  console.log('🔍 Парсинг справочника профессий с rabota.md...');

  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox'] 
  });
  
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Переходим на страницу, где перечислены все категории/профессии
    await page.goto('https://www.rabota.md/ru/jobs', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Ждем появления хотя бы одной ссылки на профессию
    // Судя по вашему HTML, у них класс "professionsItem" и "text-base"
    const professionSelector = 'a.professionsItem.text-base';
    await page.waitForSelector(professionSelector, { timeout: 15000 });

    const professions = await page.evaluate((selector) => {
      // Находим все ссылки на конкретные профессии
      const cards = document.querySelectorAll(selector);
      
      const results: Array<{
        profession: string;
        id?: string;
        url?: string;
      }> = [];

      cards.forEach(card => {
        // Название профессии находится во вложенном div с классом text-black
        const professionName = card.querySelector('.text-black')?.textContent?.trim() || '';
        const href = card.getAttribute('href') || '';

        if (professionName && href) {
          // На этой странице нет числовых ID в ссылках (там слаги типа /jobs-moldova-Android-Developer)
          // В качестве ID используем последнюю часть ссылки
          const slug = href.split('-').pop(); 

          results.push({
            profession: professionName,
            id: slug, 
            url: href.startsWith('http') ? href : 'https://www.rabota.md' + href
          });
        }
      });

      return results;
    }, professionSelector);

    console.log(`✅ Успешно собрано ${professions.length} профессий из справочника`);

    await browser.close();
    return professions;

  } catch (error) {
    console.error('❌ Ошибка при парсинге справочника rabota.md:', error.message);
    await browser.close();
    return [];
  }
}
const puppeteer = require('puppeteer')
const fs = require('fs')

const villasLinks = {
	Phuket: [
		'https://royal-property.pro/houses-sale/houses-phuket/?PAGEN_2=1',
		'https://royal-property.pro/houses-sale/houses-phuket/?PAGEN_2=2',
		'https://royal-property.pro/houses-sale/houses-phuket/?PAGEN_2=3',
		'https://royal-property.pro/houses-sale/houses-phuket/?PAGEN_2=4',
	],
	Pattaya: ['https://royal-property.pro/houses-sale/houses-pataya/'],
}

async function scrapeVillas() {
	const browser = await puppeteer.launch({ headless: true })
	const page = await browser.newPage()
	let results = {}

	// Перебор всех регионов
	for (let region in villasLinks) {
		results[region] = [] // Инициализация массива для региона

		for (let link of villasLinks[region]) {
			await page.goto(link, { waitUntil: 'domcontentloaded' })

			// Извлечение данных с каждой карточки
			const villas = await page.$$eval('.apartments-slide', cards => {
				return cards.map(card => {
					const title = card
						.querySelector('.apartments-slide__body .title_a')
						?.innerText.trim()
					const details = card
						.querySelector('.apartments-slide__body .div_apartments')
						?.innerText.trim()
					const detailLink = card.querySelector('.apartments-slide__body .title_a')?.href

					return {
						title,
						details,
						detailLink,
					}
				})
			})

			for (let villa of villas) {
				await page.goto(villa.detailLink, { waitUntil: 'domcontentloaded' })

				// Извлечение картинок из swiper
				const images = await page.$$eval('.about-slide img', slides => {
					return slides.map(slide => slide.src)
				})

				// Извлечение изображений из галереи
				const galleryImages = await page.evaluate(() => {
					return Array.from(
						document.querySelectorAll('.gallery__wrapper .gallery__item img'),
					).map(img => img.src)
				})

				// Извлечение описания, исключая iframe
				const description = await page.$eval('.about-detail__desc', desc => {
					const iframe = desc.querySelector('iframe')
					if (iframe) iframe.remove() // Удаляем iframe
					return desc.innerText.trim()
				})

				// Присваиваем изображения и описание
				villa.images = images
				villa.galleryImages = galleryImages
				villa.description = description
			}

			// Добавление данных региона в результат
			results[region] = results[region].concat(villas)
		}
	}

	await browser.close()

	// Сохранение данных в JSON файл
	fs.writeFileSync('villas.json', JSON.stringify(results, null, 2), 'utf-8')
	console.log('Данные сохранены в villas.json')
}

scrapeVillas().catch(console.error)

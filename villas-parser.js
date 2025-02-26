const puppeteer = require('puppeteer')
const crypto = require('crypto');
const fs = require('fs')
const axios = require('axios')
const { config } = require('./constants')
const apartmentParser = require('./apartment_parser')

const keyCityMap = {
	Pattaya: 'Паттайя',
	Phuket: 'Пхукет',
};

function generateIdFromString(input) {
	return crypto.createHash('md5').update(input).digest('hex');
}

const cities = {
	Phuket: 'https://royal-property.pro/village/houses-phuket/',
	Pattaya: 'https://royal-property.pro/village/houses-pataya/',
}

async function scrapeVillages() {
	const browser = await puppeteer.launch({ headless: true })
	const page = await browser.newPage()
	const villages = []
	const apartments = []

	try {
		for (let city in cities) {
			await page.goto(cities[city], { waitUntil: 'domcontentloaded' })

			// Извлечение ссылок на поселки
			const villageObjects = await page.$$eval('.product__docs_body_line > div > a', villages => {
				return villages.map(village => {
					const title = village.textContent.trim()
					const link = village.href
					return {
						title,
						link
					}
				})
			})

			for (const village of villageObjects) {
				village.id = generateIdFromString(village.link);
				village.city = keyCityMap[city] || null;
				village.country = 'Таиланд';
			}

			// Извлечение данных каждого поселка
			for (let village of villageObjects) {
				await page.goto(village.link, { waitUntil: 'domcontentloaded' })
				console.log(`Opened link: ${village.link}`)

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

					const containers = desc.querySelectorAll('.container')
					containers.forEach((container) => {
						container.remove()
					})

					return desc.innerHTML.trim() || ''
				})

				// Извлечение карточек вилл
				const villas = await page.$$eval('.apartments .apartments-slider__wrapper .apartments-slide', villaCards => {
					return villaCards.map(villaCard => {
						const infoBlocks = villaCard.querySelectorAll('.apartments_body_info .apartments_body_info_in .apartments_body_info_text');

						let bedrooms = null;
						let bathrooms = null;

						infoBlocks.forEach(block => {
							const text = block.textContent.trim();

							if (/спальн[яи]/i.test(text) || /спален/i.test(text)) {
								bedrooms = parseInt(text.replace(/[^0-9]/g, ''), 10);
							} else if (/ванные?/i.test(text)) {
								bathrooms = parseInt(text.replace(/[^0-9]/g, ''), 10);
							}
						});

						return {
							bedrooms: bedrooms,
							bathrooms: bathrooms,
							link: villaCard.querySelector('.button-dark')?.getAttribute('href') || null
						};
					})
				});

				// Присваиваем изображения и описание
				village.images = images
				village.galleryImages = galleryImages
				village.description = description
				village.apartments = villas

				for (let apartment of village.apartments) {
					const link = apartment.link
					try {
						axios
							.get(`${config.baseUrl}${link}`)
							.then(response => {
								const html = response.data

								const apartmentData = apartmentParser(html)
								apartmentData.bedrooms = apartment.bedrooms;
								apartmentData.bathrooms = apartment.bathrooms;
								apartmentData.country = village.country;
								apartmentData.city = village.city;

								apartmentData.link = link;
								apartmentData.id = generateIdFromString(link);
								apartmentData.parentId = village.id;

								console.log('Data for apartment:', apartmentData)
								apartments.push(apartmentData)
							})
							.catch(error => {
								console.error('Error while parsing apartment:', error)
							})
					} catch (error) {
						console.error(`Error while processing apartment link ${link}:`, error)
					}
				}
			}

			villages.push(...villageObjects)
		}
	} catch (error) {
		console.error('Ошибка при парсинге:', error);
	} finally {
		await browser.close();
	}

	// Сохранение данных в JSON файл
	fs.writeFileSync('villages.json', JSON.stringify(villages, null, 2), 'utf-8')
	fs.writeFileSync('villas.json', JSON.stringify(apartments, null, 2), 'utf-8')
	console.log('Данные сохранены в villages.json')
}

scrapeVillages().catch(console.error)

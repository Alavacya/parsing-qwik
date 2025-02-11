const puppeteer = require('puppeteer')
const crypto = require('crypto');
const { config, selectors } = require('./constants')
const fs = require('fs')
const axios = require('axios')
const apartmentParser = require('./apartment_parser')

function generateIdFromString(input) {
	return crypto.createHash('md5').update(input).digest('hex');
}

async function getOffersCardsList(page, offerWrapSelector, cardSelector, key) {
	const keyCityMap = {
		PatayaOffer: 'Паттайя',
		PhuketOffer: 'Пхукет',
	};

	return await page.evaluate(
		(offerWrapSelector, cardSelector, keyCityMap, key) => {
			const container = document.querySelector(offerWrapSelector)
			if (!container) {
				return []
			}
			return Array.from(container.querySelectorAll(cardSelector)).map(card => ({
				selectorKey: key,
				city: keyCityMap[key] || null,
				country: 'Таиланд',
				title: card.querySelector('.apartments-slide__body a')?.textContent.trim() || '',
				description:
					card.querySelector('.apartments-slide__body p')?.textContent.trim() || '',
				link:
					card.querySelector('.apartments-slide__buttons a')?.getAttribute('href') || '',
			}))
		},
		offerWrapSelector,
		cardSelector,
		keyCityMap,
		key,
	)
}

async function getDetailedInfo(page, link) {
	await page.goto(link, { waitUntil: 'networkidle2' })
	console.log(`Opened link: ${link}`)

	const detailedInfo = await page.evaluate(() => {
		const images = Array.from(document.querySelectorAll('.gallery__wrapper img')).map(
			img => img.src,
		)
		const presaleText =
			document.querySelector('.zk-special-price-block p')?.textContent.trim() || ''
		const description = document.querySelector('.about-detail__desc')?.innerHTML.trim() || ''

		const floorPlans = Array.from(
			document.querySelectorAll('.floor .apartments-slider__wrapper .apartments-slide'),
		).map(slide => {
			const img = slide.querySelector('img')
			const title = slide.querySelector('.stickers span')?.textContent.trim() || ''
			return {
				imgSrc: img ? img.src : '',
				title: title,
			}
		})

		const apartmentsLayouts = Array.from(
			document.querySelectorAll('.scheme .apartments-slider__wrapper .apartments-slide img'),
		).map(img => img.src)

		const apartmentSlides = document.querySelectorAll('.apartments .apartments-slider__wrapper .apartments-slide');
		const apartments = Array.from(apartmentSlides).map(slide => {
			const infoBlocks = slide.querySelectorAll('.apartments_body_info .apartments_body_info_in .apartments_body_info_text');

			let bedrooms = null;
			let bathrooms = null;

			infoBlocks.forEach(block => {
				const text = block.textContent.trim();

				if (/спальн[яи]/i.test(text)) {
					bedrooms = parseInt(text.replace(/[^0-9]/g, ''), 10);
				} else if (/ванные?/i.test(text)) {
					bathrooms = parseInt(text.replace(/[^0-9]/g, ''), 10);
				}
			});

			return {
				bedrooms: bedrooms,
				bathrooms: bathrooms,
				link: slide.querySelector('.button-dark')?.getAttribute('href') || null
			};
		});

		return { images, presaleText, description, floorPlans, apartmentsLayouts, apartments }
	})

	return detailedInfo
}

const startScraper = async () => {
	const browser = await puppeteer.launch()
	const page = await browser.newPage()

	try {
		await page.goto(config.offersPage, { waitUntil: 'networkidle2' })

		const offerWrapSelectors = {
			PatayaOffer: '.profitable-offer:nth-of-type(1)',
			PhuketOffer: '.profitable-offer:nth-of-type(2)',
		}

		const groupedCards = []
		const groupedApartments = []
		const apartmentParser = require('./apartment_parser')

		for (const [key, selector] of Object.entries(offerWrapSelectors)) {
			console.log(`Processing container: ${selector} with key: ${key}`)
			const cards = await getOffersCardsList(page, selector, selectors.offersItem, key)

			cards.forEach(card => {
				card.id = generateIdFromString(card.link);
			});

			groupedCards.push(...cards)
		}

		for (let card of groupedCards) {
			if (card.link) {
				try {
					const detailedInfo = await getDetailedInfo(
						page,
						`${config.baseUrl}${card.link}`,
					)
					card.detailedInfo = detailedInfo
				} catch (error) {
					console.error(`Error while getting detailed info for ${card.title}:`, error)
				}

				for (let apartment of card.detailedInfo.apartments) {
					const link = apartment.link
					const linkApartment = `${config.baseUrl}${link}`
					try {
						const apartmentPage = await page.goto(linkApartment, {
							waitUntil: 'networkidle2',
						})
						console.log(`Opened apartmentPage: ${linkApartment}`)

						axios
							.get(linkApartment)
							.then(response => {
								const html = response.data

								const apartmentData = apartmentParser(html)
								apartmentData.bedrooms = apartment.bedrooms;
								apartmentData.bathrooms = apartment.bathrooms;
								apartmentData.country = card.country;
								apartmentData.city = card.city;

								apartmentData.link = link;
								apartmentData.id = generateIdFromString(link);
								apartmentData.parentId = card.id;

								console.log('Data for apartment:', apartmentData)
								groupedApartments.push(apartmentData)
							})
							.catch(error => {
								console.error('Error while parsing apartment:', error)
							})
					} catch (error) {
						console.error(`Error while processing apartment link ${link}:`, error)
					}
				}
			}
		}

		console.log('Grouped Cards:', groupedCards)
		console.log('Grouped Apartments:', groupedApartments)

		fs.writeFileSync('groupedCards.json', JSON.stringify(groupedCards, null, 2), 'utf-8')
		fs.writeFileSync(
			'groupedApartments.json',
			JSON.stringify(groupedApartments, null, 2),
			'utf-8',
		)
		console.log('Grouped cards saved to groupedCards.json')
	} catch (e) {
		console.error('Error in startScraper:', e.message)
	} finally {
		await browser.close()
	}
}

startScraper()

const puppeteer = require('puppeteer')
const crypto = require('crypto')
const { config, selectors } = require('./constants')
const fs = require('fs/promises')
const { JSDOM } = require('jsdom')
const axios = require('axios')

function generateIdFromString(input) {
	return crypto.createHash('md5').update(input).digest('hex')
}

async function getOffersCardsList(page, offerWrapSelector, cardSelector, key) {
	const keyCityMap = {
		PatayaOffer: 'Паттайя',
		PhuketOffer: 'Пхукет',
	}

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

function getDeveloperCardInfo(DOMElement, city) {
	return {
		city: city || null,
		country: 'Таиланд',
		title: DOMElement.querySelector('.apartments-slide__body a')?.textContent.trim() || '',
		description:
			DOMElement.querySelector(
				'.apartments-slide__body .div_apartments',
			)?.textContent.trim() || '',
		link: DOMElement.querySelector('.apartments-slide__buttons a')?.getAttribute('href') || '',
	}
}

function getDevelopersInfo(DOMElement, city) {
	if (!DOMElement) return []
	const elements = Array.from(DOMElement.querySelectorAll('.apartments-slide'))
	return elements.map(element => getDeveloperCardInfo(element, city))
}

async function getDetailedInfo(page, link) {
	await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 })
	console.log(`Opened link: ${link}`)

	// добавить получения координатов жк
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

		const apartmentSlides = document.querySelectorAll(
			'.apartments .apartments-slider__wrapper .apartments-slide',
		)

		function extractLatLngFromGoogleMapsSrc(src) {
			const matchLat = src.match(/!3d([-.\d]+)/)
			const matchLng = src.match(/!2d([-.\d]+)/)

			if (matchLat && matchLng) {
				const lat = parseFloat(matchLat[1])
				const lng = parseFloat(matchLng[1])
				return { lat, lng }
			}

			return null
		}

		const mapSrc =
			document.querySelector('.map .double-block--right iframe')?.getAttribute('src') || ''
		const coordinates = extractLatLngFromGoogleMapsSrc(mapSrc)

		const apartments = Array.from(apartmentSlides).map(slide => {
			const infoBlocks = slide.querySelectorAll(
				'.apartments_body_info .apartments_body_info_in .apartments_body_info_text',
			)

			let bedrooms = null
			let bathrooms = null

			infoBlocks.forEach(block => {
				const text = block.textContent.trim()

				if (/спальн[яи]/i.test(text)) {
					bedrooms = parseInt(text.replace(/[^0-9]/g, ''), 10)
				} else if (/ванные?/i.test(text)) {
					bathrooms = parseInt(text.replace(/[^0-9]/g, ''), 10)
				}
			})

			return {
				bedrooms: bedrooms,
				bathrooms: bathrooms,
				link: slide.querySelector('.button-dark')?.getAttribute('href') || null,
			}
		})

		return {
			images,
			presaleText,
			description,
			floorPlans,
			apartmentsLayouts,
			apartments,
			coordinates,
		}
	})

	console.log(`Data detailedInfo:`)
	console.log(detailedInfo)
	return detailedInfo
}

// начало скрипта
const startScraper = async () => {
	const browser = await puppeteer.launch()
	const page = await browser.newPage()

	try {
		const fileCityMap = {
			Паттайя: 'pattaya-property.html',
			Пхукет: 'phuket-property.html',
		}

		const developers = []
		const properties = []
		const apartmentParser = require('./apartment_parser')

		for (const [city, file] of Object.entries(fileCityMap)) {
			try {
				const html = await fs.readFile(file, 'utf8')
				const dom = new JSDOM(html)
				const document = dom.window.document

				const cards = getDevelopersInfo(document, city)

				cards.forEach(card => {
					card.id = generateIdFromString(card.link)
				})

				developers.push(...cards)
			} catch (err) {
				console.error(`Ошибка при обработке файла ${file}:`, err)
			}
		}

		for (let developer of developers) {
			if (developer.link) {
				try {
					console.log('Start handle zk: ', developer.title)
					console.log('Zk link: ', developer.link)
					const detailedInfo = await getDetailedInfo(
						page,
						`${config.baseUrl}${developer.link}`,
					)
					developer.detailedInfo = detailedInfo
				} catch (error) {
					console.error(
						`Error while getting detailed info for ${developer.title}:`,
						error,
					)
				}

				for (let apartment of developer.detailedInfo.apartments) {
					const link = apartment.link
					const linkApartment = `${config.baseUrl}${link}`
					try {
						console.log(`Handle apartment: ${linkApartment}`)

						axios
							.get(linkApartment)
							.then(response => {
								const html = response.data

								const apartmentData = apartmentParser(html)
								apartmentData.bedrooms = apartment.bedrooms
								apartmentData.bathrooms = apartment.bathrooms
								apartmentData.country = developer.country
								apartmentData.city = developer.city

								apartmentData.link = link
								apartmentData.id = generateIdFromString(link)
								apartmentData.parentId = developer.id

								// console.log('Data for apartment:', apartmentData)
								properties.push(apartmentData)
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

		console.log('Developers count:', developers.length)
		console.log('Properties count:', properties.length)

		await fs.writeFile('developers.json', JSON.stringify(developers, null, 2), 'utf-8')
		await fs.writeFile('properties.json', JSON.stringify(properties, null, 2), 'utf-8')
	} catch (e) {
		console.error('Error in startScraper:', e.message)
	} finally {
		await browser.close()
	}
}

startScraper()

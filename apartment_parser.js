const cheerio = require('cheerio')

const parseArea = areaText => {
	const [value, uom] = areaText.trim().split(/\s+/)
	return {
		value: parseFloat(value),
		uom: uom || '',
	}
}

const parsePrice = priceText => {
	const currencyMap = {
		'₽': 'RUB',
		$: 'USD',
		'€': 'EUR',
		'฿': 'THB',
		'£': 'GBP',
		'¥': 'JPY',
		'₣': 'CHF',
		'₹': 'INR',
		'₣': 'CHF',
	}

	const parts = priceText.trim().split(/\s+/)
	const value = parts.slice(0, -1).join('')
	const currencySymbol = parts[parts.length - 1]

	const currency = currencyMap[currencySymbol] || currencySymbol

	return {
		value: parseFloat(value),
		currency: currency || '',
	}
}

/**
 * Парсит данные о квартире со страницы.
 * @param {string} html - HTML-код страницы.
 * @returns {Object} Данные о квартире.
 */
const parseApartment = html => {
	const $ = cheerio.load(html)

	// Получаем данные с страницы
	const name = $('div.detail-header__title > h1').text().trim()
	const description = $('div.about-detail__desc').text().trim()

	// Извлечение данных из списка информации
	const district = $('ul.detail-header__info-list li:contains("Район") span').text().trim()

	const areaText = $('ul.detail-header__info-list li:contains("Общая площадь") span')
		.text()
		.trim()
	const area = parseArea(areaText)

	const objectType = $('ul.detail-header__info-list li:contains("Вид объекта") span')
		.text()
		.trim()
	const floor = $('ul.detail-header__info-list li:contains("Этаж") span').text().trim()
	const quota = $('ul.detail-header__info-list li:contains("Квота") span').text().trim()
	const furniture = $('ul.detail-header__info-list li:contains("Мебель") span').text().trim()

	// Получаем массив цен
	const prices = []
	const currentPrice = $('p.detail-header__price-current').text().trim()
	if (currentPrice) {
		prices.push(parsePrice(currentPrice))
	}
	$('div.detail-header__price-list .detail-header__price-item > p').each((i, el) => {
		prices.push(parsePrice($(el).text().trim()))
	})

	// Получаем массив изображений
	const images = []
	$('div.detail-header__left > div > div.swiper-wrapper img').each((i, el) => {
		images.push($(el).attr('src'))
	})

	// Возвращаем объект с данными
	return {
		name,
		description,
		district,
		area,
		object_type: objectType,
		floor,
		quota,
		furniture,
		prices,
		images,
	}
}

module.exports = parseApartment

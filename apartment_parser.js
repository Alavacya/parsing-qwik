const cheerio = require('cheerio')
const { config } = require('./constants')

const parseSize = sizeText => {
	const [value, uom] = sizeText.trim().split(/\s+/)
	return {
		value: parseFloat(value),
		uom: uom || '',
	}
}

const parsePrice = priceText => {
	const currencyMap = {
		'₽': 'RUB',
		'$': 'USD',
		'€': 'EUR',
		'฿': 'THB',
		'¥': 'CNY',
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
		symbol: getCurrencySignByCode(currency)
	}
}

function getCurrencySignByCode(code) {
	const currencyMap = {
		'RUB': '₽',
		'USD': '$',
		'EUR': '€',
		'THB': '฿',
		'CNY': '¥',
		'GBP': '£',
		'JPY': '¥',
		'CHF': '₣',
		'INR': '₹'
	};

    return currencyMap[code] || '';
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
	const area = $('ul.detail-header__info-list li:contains("Район") span').text().trim()

	const sizeText = $('ul.detail-header__info-list li:contains("Общая площадь") span')
		.text()
		.trim()
	const size = parseSize(sizeText)

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
		const src = $(el).attr('src')
		const fullPath = `${config.baseUrl}${src}`
		images.push(fullPath)
	})

	// Возвращаем объект с данными
	return {
		name,
		description,
		area, // район
		size, // площадь
		object_type: objectType,
		floor,
		quota,
		furniture,
		prices,
		images,
	}
}

module.exports = parseApartment

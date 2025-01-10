const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

async function parsePage(url) {
	const browser = await puppeteer.launch()
	const page = await browser.newPage()

	try {
		console.log('Open:', url)
		await page.goto(url, { waitUntil: 'networkidle2' })

		const data = await page.evaluate(() => {
			const title = document.title

			const images = Array.from(document.querySelectorAll('.detail-header__left img')).map(
				img => img.src,
			)

			return { title, images }
		})

		console.log(`Data is done: ${data.title}`)
		await browser.close()
		return data
	} catch (e) {
		console.error('Error in parsing page:', e.message)
		await browser.close()
		return null
	}
}

async function downloadImage(url, folder) {
	try {
		const response = await axios.get(url, { responseType: 'stream' })
		const fileName = path.basename(url.split('?')[0])
		const filePath = path.join(folder, fileName)

		await new Promise((resolve, reject) => {
			const writeStream = fs.createWriteStream(filePath)
			response.data.pipe(writeStream)
			writeStream.on('finish', resolve)
			writeStream.on('error', reject)
		})

		console.log(`Downloaded: ${url} -> ${filePath}`)
	} catch (error) {
		console.error(`Error downloading ${url}: ${error.message}`)
	}
}

;(async function main() {
	const urls = [
		'https://royal-property.pro/flats/pattaya-property/developments/the-riviera-santa-monica-2-bedroom-50-72-m/',
	]

	const outputFolder = './images'
	if (!fs.existsSync(outputFolder)) {
		fs.mkdirSync(outputFolder)
	}

	for (const url of urls) {
		const data = await parsePage(url)
		if (data) {
			console.log(`Title page: ${data.title}`)
			for (const imageUrl of data.images) {
				await downloadImage(imageUrl, outputFolder)
			}
		}
	}

	console.log('Parsing is done')
})()

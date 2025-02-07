const axios = require('axios');
const fs = require('fs');
const path = require('path');

const propertyFilePath = path.join(__dirname, 'groupedApartments.json');
const developersFilePath = path.join(__dirname, 'groupedCards.json');
const downloadFolder = path.join(__dirname, 'uploads');

if (!fs.existsSync(downloadFolder)) {
	fs.mkdirSync(downloadFolder, { recursive: true });
}

function getImagesFromJson() {
	try {
		const propertyData = fs.readFileSync(propertyFilePath, 'utf8');
		const developersData = fs.readFileSync(developersFilePath, 'utf8');

		const propertyJsonData = JSON.parse(propertyData);
		const developersJsonData = JSON.parse(developersData);

		// Получаем все ссылки из property.json
		const propertyImages = propertyJsonData.flatMap(item => item.images || []);

		// Получаем ссылки из developers.json
		const developerImages = developersJsonData.flatMap(item => [
			...(item.detailedInfo?.images || []),
			...(item.detailedInfo?.floorPlans?.map(plan => plan.imgSrc) || []),
			...(item.detailedInfo?.apartmentsLayouts || [])
		]);

		console.log(`Найдено ${propertyImages.length} изображений квартир.`);
		console.log(`Найдено ${developerImages.length} изображений застройщика.`);

		// Объединяем и убираем дубликаты
		return Array.from(new Set([...propertyImages, ...developerImages]));
	} catch (error) {
		console.error('Ошибка чтения JSON-файла:', error.message);
		return [];
	}
}

async function downloadImage(url) {
	try {
		const filename = path.basename(url);
		const filePath = path.join(downloadFolder, filename);

		// Проверяем, существует ли файл
		if (fs.existsSync(filePath)) {
			console.log(`Файл уже загружен: ${filename}`);
			return;
		}

		const response = await axios({
			url,
			responseType: 'stream'
		});

		const writer = fs.createWriteStream(filePath);
		response.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer.on('finish', () => {
				console.log(`Загружено: ${filename}`);
				resolve();
			});
			writer.on('error', reject);
		});

	} catch (error) {
		console.error(`Ошибка загрузки ${url}:`, error.message);
	}
}

async function downloadImagesWithLimit(urls, limit = 5) {
	const queue = [...urls];
	const workers = Array.from({ length: limit }, async () => {
		while (queue.length) {
			const url = queue.shift();
			await downloadImage(url);
		}
	});
	await Promise.all(workers);
}

async function downloadAllImages() {
	const images = getImagesFromJson();
	const uniqueImages = [...new Set(images)];

	if (uniqueImages.length === 0) {
		console.log('Нет изображений для загрузки.');
		return;
	}

	console.log(`Найдено ${images.length} изображений.`);
	console.log(`Найдено ${uniqueImages.length} уникальных изображений.`);
	
	await downloadImagesWithLimit(uniqueImages, 5);
	
	console.log('✅ Все изображения загружены!');
}

downloadAllImages();

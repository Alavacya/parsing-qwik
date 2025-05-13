const puppeteer = require('puppeteer')
const crypto = require('crypto');
const { config, selectors } = require('./constants')
const fs = require('fs/promises')
const { JSDOM } = require('jsdom');
const axios = require('axios')

function generateIdFromString(input) {
    return crypto.createHash('md5').update(input).digest('hex');
}

function getApartmentCardInfo(DOMElement, city) {
    const infoBlocks = DOMElement.querySelectorAll(
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
        city: city,
        country: 'Таиланд',
        link: DOMElement.querySelector('.button-dark')?.getAttribute('href') || null,
    }
}

function getApartmentsInfo(DOMElement, city) {
    if (!DOMElement) return [];
    const elements = Array.from(DOMElement.querySelectorAll('.apartments-slide'));
    return elements.map(element => getApartmentCardInfo(element));
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

const start = async () => {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    try {
        let apartments = []
        let properties = []
        const apartmentParser = require('./apartment_parser')

        try {
            const json = await fs.readFile('unique_objects.json', 'utf8');
            apartments = JSON.parse(json);

            apartments.forEach(apartment => {
                apartment.id = generateIdFromString(apartment.link);
            });
        } catch (err) {
            console.error(`Ошибка при обработке файла:`, err);
        }

        for (let apartment of apartments) {
            if (apartment.link) {
                const link = apartment.link
                const fullLink = `${config.baseUrl}${link}`
                try {
                    console.log(`Handle apartment: ${fullLink}`)

                    const response = await axios.get(fullLink);
                    const html = response.data

                    const apartmentData = apartmentParser(html)
                    apartmentData.bedrooms = apartment.bedrooms;
                    apartmentData.bathrooms = apartment.bathrooms;
                    apartmentData.country = apartment.country;
                    apartmentData.id = apartment.id;
                    apartmentData.link = link;
                    
                    // нужно получить parentId, city, country
                    // apartmentData.parentId = '';
                    // apartmentData.city = '';
                    // apartmentData.country = '';

                    properties.push(apartmentData)
                } catch (error) {
                    console.error(`Error while processing apartment link ${link}:`, error)
                }
            }
        }

        console.log('Unique properties count:', properties.length)

        await fs.writeFile('unique_objects_full.json', JSON.stringify(properties, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error:', e.message)
    } finally {
        await browser.close()
    }
}

start()

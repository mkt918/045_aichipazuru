
import fs from 'fs';
import { PNG } from 'pngjs';

const MAP_PATH = 'public/img/aichi_color_map.png';
const CITY_PATH = 'public/img/cities/color_city_01.png';

function readPng(filePath) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(new PNG())
            .on('parsed', function () {
                resolve(this);
            })
            .on('error', reject);
    });
}

async function diagnose() {
    const mapImg = await readPng(MAP_PATH);
    const cityImg = await readPng(CITY_PATH);

    console.log(`Map: ${mapImg.width}x${mapImg.height}`);
    console.log(`City 01: ${cityImg.width}x${cityImg.height}`);

    // Sample center pixel of city
    const cx = Math.floor(cityImg.width / 2);
    const cy = Math.floor(cityImg.height / 2);
    const idx = (cityImg.width * cy + cx) << 2;

    console.log(`City Center Pixel RGBA: ${cityImg.data[idx]}, ${cityImg.data[idx + 1]}, ${cityImg.data[idx + 2]}, ${cityImg.data[idx + 3]}`);
}

diagnose().catch(console.error);

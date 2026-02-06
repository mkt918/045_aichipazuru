
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

function getDominantColors(img, label) {
    const counts = {};
    for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] < 50) continue; // Skip transparent
        const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
        counts[key] = (counts[key] || 0) + 1;
    }

    // Sort by count
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 50);
    console.log(`\nTop 50 Colors in ${label}:`);
    sorted.forEach(([color, count]) => {
        const [r, g, b] = color.split(',').map(Number);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max - min;
        if (saturation > 20) {
            console.log(`  RGB(${color}): ${count} pixels (COLOR!)`);
        } else {
            console.log(`  RGB(${color}): ${count} pixels (Gray-ish)`);
        }
    });
}

async function sampleValues() {
    const mapImg = await readPng(MAP_PATH);
    const cityImg = await readPng(CITY_PATH);

    getDominantColors(mapImg, 'MAP');
    getDominantColors(cityImg, 'CITY 01');
}

sampleValues().catch(console.error);

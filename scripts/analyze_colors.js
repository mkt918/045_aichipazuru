
import fs from 'fs';
import { PNG } from 'pngjs';
import path from 'path';

const MAP_PATH = 'public/img/aichi_color_map.png';

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

async function analyzeMapColors() {
    console.log('Loading map...');
    const mapImg = await readPng(MAP_PATH);

    const targetR = 255;
    const targetG = 127;
    const targetB = 39;

    let matchCount = 0;
    let closeMatchCount = 0;

    console.log(`Searching for RGB(${targetR},${targetG},${targetB}) in ${mapImg.width}x${mapImg.height} map...`);

    for (let y = 0; y < mapImg.height; y++) {
        for (let x = 0; x < mapImg.width; x++) {
            const idx = (mapImg.width * y + x) << 2;
            const r = mapImg.data[idx];
            const g = mapImg.data[idx + 1];
            const b = mapImg.data[idx + 2];

            if (r === targetR && g === targetG && b === targetB) {
                matchCount++;
            }

            // Check within tolerance 10
            const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
            if (diff < 10) {
                closeMatchCount++;
            }
        }
    }

    console.log(`Exact Matches: ${matchCount}`);
    console.log(`Close Matches (diff < 10): ${closeMatchCount}`);
}

analyzeMapColors().catch(console.error);

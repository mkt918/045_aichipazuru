
import fs from 'fs';
import { PNG } from 'pngjs';
import path from 'path';

const MAP_PATH = 'public/img/aichi_color_map.png';
const CITIES_DIR = 'public/img/cities';
const OUTPUT_PATH = 'public/data/coordinates.json';

// Helper to read PNG
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

// Check if image data matches at given coordinates
function matchesAt(bigImg, smallImg, startX, startY) {
    // Check center point first for speed
    const sampleX = Math.floor(smallImg.width / 2);
    const sampleY = Math.floor(smallImg.height / 2);

    // Simple pixel comparison at center
    const idx = (bigImg.width * (startY + sampleY) + (startX + sampleX)) << 2;
    const sIdx = (smallImg.width * sampleY + sampleX) << 2;

    // Basic color check (with some tolerance)
    if (Math.abs(bigImg.data[idx] - smallImg.data[sIdx]) > 50) return false;

    // Full scan if center passes (sampled)
    let mismatchCount = 0;
    const samples = 200; // Check 200 random points

    for (let i = 0; i < samples; i++) {
        const rx = Math.floor(Math.random() * smallImg.width);
        const ry = Math.floor(Math.random() * smallImg.height);

        // Skip empty pixels in small image
        const sPos = (smallImg.width * ry + rx) << 2;
        if (smallImg.data[sPos + 3] < 50) continue; // Alpha check

        const bPos = (bigImg.width * (startY + ry) + (startX + rx)) << 2;

        // Compare RGB
        const diff =
            Math.abs(bigImg.data[bPos] - smallImg.data[sPos]) +
            Math.abs(bigImg.data[bPos + 1] - smallImg.data[sPos + 1]) +
            Math.abs(bigImg.data[bPos + 2] - smallImg.data[sPos + 2]);

        if (diff > 80) mismatchCount++;
    }

    return mismatchCount < 20; // Allow 10% mismatch
}

async function findCoordinates() {
    console.log('Loading map...');
    const mapImg = await readPng(MAP_PATH);

    // Debug mode: Focus on City 01 only first
    const files = ['color_city_01.png'];
    const results = {};

    console.log(`Processing ${files.length} cities (DEBUG MODE)...`);

    for (const file of files) {
        const cityPath = path.join(CITIES_DIR, file);
        if (!fs.existsSync(cityPath)) continue;

        console.log(`Processing ${file}...`);
        const cityImg = await readPng(cityPath);

        // Find a solid center-ish pixel to avoid edges which might have anti-aliasing artifacts
        let anchorX = Math.floor(cityImg.width / 2);
        let anchorY = Math.floor(cityImg.height / 2);
        let foundAnchor = false;

        // Spiral out from center to find opaque pixel
        let radius = 0;
        while (radius < Math.min(cityImg.width, cityImg.height) / 2) {
            // Simple scan for now
            for (let y = Math.max(0, anchorY - radius); y < Math.min(cityImg.height, anchorY + radius); y++) {
                for (let x = Math.max(0, anchorX - radius); x < Math.min(cityImg.width, anchorX + radius); x++) {
                    const idx = (cityImg.width * y + x) << 2;
                    if (cityImg.data[idx + 3] > 250) { // Fully opaque
                        anchorX = x;
                        anchorY = y;
                        foundAnchor = true;
                        break;
                    }
                }
                if (foundAnchor) break;
            }
            if (foundAnchor) break;
            radius += 10;
        }

        if (!foundAnchor) {
            console.warn(`Warning: ${file} seems empty or fully transparent.`);
            results[file] = { x: 0, y: 0, error: true };
            continue;
        }

        // Capture the anchor pixel color
        const aIdx = (cityImg.width * anchorY + anchorX) << 2;
        const r = cityImg.data[aIdx];
        const g = cityImg.data[aIdx + 1];
        const b = cityImg.data[aIdx + 2];

        console.log(`Anchor for ${file} at (${anchorX}, ${anchorY}): RGB(${r},${g},${b})`);

        // Search globally in map
        let bestFit = null;
        let minError = Infinity;

        // Optimization: Step 2 pixels to speed up initial search
        const step = 2;

        for (let y = 0; y < mapImg.height - cityImg.height; y += step) {
            for (let x = 0; x < mapImg.width - cityImg.width; x += step) {

                // Quick color check for anchor
                const mIdx = (mapImg.width * (y + anchorY) + (x + anchorX)) << 2;
                const diff = Math.abs(mapImg.data[mIdx] - r) + Math.abs(mapImg.data[mIdx + 1] - g) + Math.abs(mapImg.data[mIdx + 2] - b);

                if (diff < 40) { // Looser tolerance
                    // Verify with full sampling
                    if (matchesAt(mapImg, cityImg, x, y)) {
                        results[file] = { x, y, width: cityImg.width, height: cityImg.height };
                        console.log(`MATCH FOUND! ${file} at ${x}, ${y}`);
                        x = mapImg.width; // Break inner
                        y = mapImg.height; // Break outer
                        bestFit = { x, y };
                    }
                }
            }
        }

        if (!results[file]) {
            console.error(`Could not locate ${file}.`);
            results[file] = { x: 0, y: 0, width: cityImg.width, height: cityImg.height, error: true };
        }
    }
}

findCoordinates().catch(console.error);

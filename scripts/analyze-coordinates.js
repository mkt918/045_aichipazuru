import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 画像を読み込む関数
function loadPNG(filepath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(new PNG())
      .on('parsed', function () {
        resolve(this);
      })
      .on('error', reject);
  });
}

// 2つの画像のピクセルが一致するかチェック（サンプリング対応）
function matchPixels(baseImg, pieceImg, baseX, baseY, samplingRate = 1.0) {
  let matchCount = 0;
  let totalPiecePixels = 0;

  // サンプリングステップの計算（1.0 = 1px, 0.1 = 10pxごと）
  const step = Math.max(1, Math.floor(1 / samplingRate));

  for (let py = 0; py < pieceImg.height; py += step) {
    for (let px = 0; px < pieceImg.width; px += step) {
      const pieceIdx = (pieceImg.width * py + px) << 2;
      const pieceAlpha = pieceImg.data[pieceIdx + 3];

      // ピースの透明部分はスキップ
      if (pieceAlpha < 50) continue;

      totalPiecePixels++;

      const bx = baseX + px;
      const by = baseY + py;

      // 背景画像の範囲外チェック
      if (bx < 0 || bx >= baseImg.width || by < 0 || by >= baseImg.height) {
        continue;
      }

      const baseIdx = (baseImg.width * by + bx) << 2;

      const dr = Math.abs(pieceImg.data[pieceIdx] - baseImg.data[baseIdx]);
      const dg = Math.abs(pieceImg.data[pieceIdx + 1] - baseImg.data[baseIdx + 1]);
      const db = Math.abs(pieceImg.data[pieceIdx + 2] - baseImg.data[baseIdx + 2]);

      if (dr + dg + db < 40) {
        matchCount++;
      }
    }
  }

  return totalPiecePixels > 0 ? matchCount / totalPiecePixels : 0;
}

// ピースの最適な位置を探す（3段階検索で高速化）
function findBestPosition(baseImg, pieceImg) {
  let bestX = 0;
  let bestY = 0;
  let bestScore = 0;

  // 段階1: 粗い検索 + 5%サンプリング (32pxステップ)
  const step1 = 32;
  for (let y = 0; y < baseImg.height - pieceImg.height; y += step1) {
    for (let x = 0; x < baseImg.width - pieceImg.width; x += step1) {
      const score = matchPixels(baseImg, pieceImg, x, y, 0.05);
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  // 段階2: 中精度検索 + 20%サンプリング (周囲32x32を8pxステップで)
  const step2 = 8;
  const range2 = step1;
  let midX = bestX;
  let midY = bestY;
  let midScore = bestScore;

  for (let y = Math.max(0, bestY - range2); y <= Math.min(baseImg.height - pieceImg.height, bestY + range2); y += step2) {
    for (let x = Math.max(0, bestX - range2); x <= Math.min(baseImg.width - pieceImg.width, bestX + range2); x += step2) {
      const score = matchPixels(baseImg, pieceImg, x, y, 0.2);
      if (score > midScore) {
        midScore = score;
        midX = x;
        midY = y;
      }
    }
  }

  // 段階3: 精密検索 + 全サンプリング (周囲8x8を1pxステップで)
  const step3 = 1;
  const range3 = step2;
  let finalX = midX;
  let finalY = midY;
  let finalScore = midScore;

  for (let y = Math.max(0, midY - range3); y <= Math.min(baseImg.height - pieceImg.height, midY + range3); y += step3) {
    for (let x = Math.max(0, midX - range3); x <= Math.min(baseImg.width - pieceImg.width, midX + range3); x += step3) {
      const score = matchPixels(baseImg, pieceImg, x, y, 1.0);
      if (score > finalScore) {
        finalScore = score;
        finalX = x;
        finalY = y;
      }
    }
  }

  return { x: finalX, y: finalY, score: finalScore };
}

async function analyzeCoordinates() {
  console.log('� 超高速画像解析（サンプリング方式）を開始します...\n');

  const basePath = path.join(__dirname, '../img/愛知県全図color.png');
  const baseImg = await loadPNG(basePath);
  console.log(`✓ 背景画像サイズ: ${baseImg.width}x${baseImg.height}\n`);

  const piecesDir = path.join(__dirname, '../color_cities');
  const pieceFiles = fs.readdirSync(piecesDir)
    .filter(f => f.endsWith('.png'))
    .sort();

  console.log(`📦 ${pieceFiles.length}個のピースを検出しました\n`);

  const coordinates = {};

  for (let i = 0; i < pieceFiles.length; i++) {
    const filename = pieceFiles[i];
    const piecePath = path.join(piecesDir, filename);

    process.stdout.write(`[${i + 1}/${pieceFiles.length}] ${filename} を解析中... `);

    try {
      const pieceImg = await loadPNG(piecePath);
      const result = findBestPosition(baseImg, pieceImg);

      console.log(`✓ (${result.x}, ${result.y}) [${(result.score * 100).toFixed(1)}%]`);

      coordinates[filename] = {
        x: result.x,
        y: result.y,
        width: pieceImg.width,
        height: pieceImg.height,
        matchScore: parseFloat((result.score * 100).toFixed(2)),
        error: result.score < 0.6 // 基準を少し緩和
      };
    } catch (error) {
      console.log(`✗ エラー: ${error.message}`);
      coordinates[filename] = { x: 0, y: 0, width: 0, height: 0, error: true };
    }
  }

  const outputPath = path.join(__dirname, '../public/data/coordinates.json');
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(coordinates, null, 2));

  console.log(`\n✅ 座標データを保存しました: ${outputPath}`);
}

analyzeCoordinates().catch(console.error);

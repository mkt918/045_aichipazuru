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
      .on('parsed', function() {
        resolve(this);
      })
      .on('error', reject);
  });
}

// 2つの画像のピクセルが一致するかチェック（アルファチャンネル考慮）
function matchPixels(baseImg, pieceImg, baseX, baseY) {
  let matchCount = 0;
  let totalPiecePixels = 0;

  for (let py = 0; py < pieceImg.height; py++) {
    for (let px = 0; px < pieceImg.width; px++) {
      const pieceIdx = (pieceImg.width * py + px) << 2;
      const pieceAlpha = pieceImg.data[pieceIdx + 3];

      // ピースの透明部分はスキップ
      if (pieceAlpha < 10) continue;

      totalPiecePixels++;

      const bx = baseX + px;
      const by = baseY + py;

      // 背景画像の範囲外チェック
      if (bx < 0 || bx >= baseImg.width || by < 0 || by >= baseImg.height) {
        continue;
      }

      const baseIdx = (baseImg.width * by + bx) << 2;

      const pieceR = pieceImg.data[pieceIdx];
      const pieceG = pieceImg.data[pieceIdx + 1];
      const pieceB = pieceImg.data[pieceIdx + 2];

      const baseR = baseImg.data[baseIdx];
      const baseG = baseImg.data[baseIdx + 1];
      const baseB = baseImg.data[baseIdx + 2];
      const baseAlpha = baseImg.data[baseIdx + 3];

      // 色が近い場合（許容誤差10）
      const colorDiff = Math.abs(pieceR - baseR) + Math.abs(pieceG - baseG) + Math.abs(pieceB - baseB);

      if (colorDiff < 30 && baseAlpha > 10) {
        matchCount++;
      }
    }
  }

  // マッチ率を返す
  return totalPiecePixels > 0 ? matchCount / totalPiecePixels : 0;
}

// ピースの最適な位置を探す
function findBestPosition(baseImg, pieceImg, searchStep = 10) {
  let bestX = 0;
  let bestY = 0;
  let bestScore = 0;

  console.log(`  Searching area: ${baseImg.width}x${baseImg.height}, Step: ${searchStep}px`);

  // 粗い検索（高速化のため）
  for (let y = 0; y < baseImg.height - pieceImg.height; y += searchStep) {
    for (let x = 0; x < baseImg.width - pieceImg.width; x += searchStep) {
      const score = matchPixels(baseImg, pieceImg, x, y);

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  // ベストポジション周辺を精密検索
  const fineSearchRange = searchStep;
  let fineX = bestX;
  let fineY = bestY;
  let fineScore = bestScore;

  for (let y = Math.max(0, bestY - fineSearchRange); y <= Math.min(baseImg.height - pieceImg.height, bestY + fineSearchRange); y++) {
    for (let x = Math.max(0, bestX - fineSearchRange); x <= Math.min(baseImg.width - pieceImg.width, bestX + fineSearchRange); x++) {
      const score = matchPixels(baseImg, pieceImg, x, y);

      if (score > fineScore) {
        fineScore = score;
        fineX = x;
        fineY = y;
      }
    }
  }

  return { x: fineX, y: fineY, score: fineScore };
}

async function analyzeCoordinates() {
  console.log('🔍 画像解析を開始します...\n');

  // 背景画像を読み込む
  const basePath = path.join(__dirname, '../img/愛知県全図color.png');
  console.log(`📂 背景画像を読み込み中: ${basePath}`);
  const baseImg = await loadPNG(basePath);
  console.log(`✓ 背景画像サイズ: ${baseImg.width}x${baseImg.height}\n`);

  // ピースディレクトリを取得
  const piecesDir = path.join(__dirname, '../color_cities');
  const pieceFiles = fs.readdirSync(piecesDir)
    .filter(f => f.endsWith('.png'))
    .sort();

  console.log(`📦 ${pieceFiles.length}個のピースを検出しました\n`);

  const coordinates = {};

  // 各ピースを解析
  for (let i = 0; i < pieceFiles.length; i++) {
    const filename = pieceFiles[i];
    const piecePath = path.join(piecesDir, filename);

    console.log(`[${i + 1}/${pieceFiles.length}] ${filename} を解析中...`);

    try {
      const pieceImg = await loadPNG(piecePath);
      console.log(`  サイズ: ${pieceImg.width}x${pieceImg.height}`);

      const result = findBestPosition(baseImg, pieceImg, 15); // 15pxステップで検索

      console.log(`  ✓ 最適位置: (${result.x}, ${result.y}), マッチ率: ${(result.score * 100).toFixed(1)}%\n`);

      coordinates[filename] = {
        x: result.x,
        y: result.y,
        width: pieceImg.width,
        height: pieceImg.height,
        matchScore: parseFloat((result.score * 100).toFixed(2)),
        error: result.score < 0.7 // マッチ率が70%未満はエラーとする
      };
    } catch (error) {
      console.error(`  ✗ エラー: ${error.message}\n`);
      coordinates[filename] = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        error: true
      };
    }
  }

  // JSON保存
  const outputPath = path.join(__dirname, '../public/data/coordinates.json');
  fs.writeFileSync(outputPath, JSON.stringify(coordinates, null, 2));

  console.log(`\n✅ 座標データを保存しました: ${outputPath}`);

  // 統計情報
  const successCount = Object.values(coordinates).filter(c => !c.error).length;
  const avgScore = Object.values(coordinates)
    .filter(c => c.matchScore)
    .reduce((sum, c) => sum + c.matchScore, 0) / successCount;

  console.log(`\n📊 統計情報:`);
  console.log(`   成功: ${successCount}/${pieceFiles.length}`);
  console.log(`   平均マッチ率: ${avgScore.toFixed(1)}%`);
}

// 実行
analyzeCoordinates().catch(console.error);

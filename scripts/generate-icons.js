const fs = require('fs');
const path = require('path');

/**
 * Generate PNG icons from SVG for PWA
 * Run this script to generate all icon sizes
 * 
 * Requirements:
 * npm install sharp
 * 
 * Usage:
 * node scripts/generate-icons.js
 */

const sharp = require('sharp');

const ICON_SIZES = [72, 96, 128, 144, 152, 167, 180, 192, 384, 512];
const INPUT_SVG = path.join(__dirname, '../public/assets/icons/icon.svg');
const OUTPUT_DIR = path.join(__dirname, '../public/assets/icons');

async function generateIcons() {
    console.log('🎨 Generating PWA icons...\n');

    const svgBuffer = fs.readFileSync(INPUT_SVG);

    for (const size of ICON_SIZES) {
        const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);
        
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(outputPath);
        
        console.log(`✅ Generated: icon-${size}x${size}.png`);
    }

    // Generate apple-touch-icon (180x180 is standard)
    await sharp(svgBuffer)
        .resize(180, 180)
        .png()
        .toFile(path.join(OUTPUT_DIR, 'apple-touch-icon.png'));
    console.log('✅ Generated: apple-touch-icon.png');

    // Generate badge icon (72x72)
    await sharp(svgBuffer)
        .resize(72, 72)
        .png()
        .toFile(path.join(OUTPUT_DIR, 'badge-72x72.png'));
    console.log('✅ Generated: badge-72x72.png');

    // Generate shortcut icons
    await sharp(svgBuffer)
        .resize(96, 96)
        .png()
        .toFile(path.join(OUTPUT_DIR, 'shortcut-add.png'));
    console.log('✅ Generated: shortcut-add.png');

    await sharp(svgBuffer)
        .resize(96, 96)
        .png()
        .toFile(path.join(OUTPUT_DIR, 'shortcut-users.png'));
    console.log('✅ Generated: shortcut-users.png');

    await sharp(svgBuffer)
        .resize(96, 96)
        .png()
        .toFile(path.join(OUTPUT_DIR, 'shortcut-calendar.png'));
    console.log('✅ Generated: shortcut-calendar.png');

    console.log('\n✨ All icons generated successfully!');
}

generateIcons().catch(console.error);

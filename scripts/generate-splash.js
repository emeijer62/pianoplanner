/**
 * Generate iOS Splash Screens from SVG
 * Run: node scripts/generate-splash.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/assets/splash');

// iOS device splash screen sizes (portrait)
const SPLASH_SCREENS = [
    { width: 640, height: 1136, name: 'splash-640x1136.png' },      // iPhone SE 1st gen
    { width: 750, height: 1334, name: 'splash-750x1334.png' },      // iPhone 8, SE 2/3
    { width: 1242, height: 2208, name: 'splash-1242x2208.png' },    // iPhone 8 Plus
    { width: 1125, height: 2436, name: 'splash-1125x2436.png' },    // iPhone X, XS, 11 Pro
    { width: 1170, height: 2532, name: 'splash-1170x2532.png' },    // iPhone 12/13/14
    { width: 1179, height: 2556, name: 'splash-1179x2556.png' },    // iPhone 14 Pro
    { width: 1284, height: 2778, name: 'splash-1284x2778.png' },    // iPhone 12/13/14 Pro Max
    { width: 1290, height: 2796, name: 'splash-1290x2796.png' },    // iPhone 14/15/16 Pro Max
    { width: 1320, height: 2868, name: 'splash-1320x2868.png' },    // iPhone 16 Pro Max
    { width: 2048, height: 2732, name: 'splash-2048x2732.png' },    // iPad Pro 12.9"
    { width: 1668, height: 2388, name: 'splash-1668x2388.png' },    // iPad Pro 11"
    { width: 1640, height: 2360, name: 'splash-1640x2360.png' },    // iPad Air
    { width: 1620, height: 2160, name: 'splash-1620x2160.png' },    // iPad 10.2"
];

// Generate splash screen SVG with centered logo
function createSplashSVG(width, height) {
    const logoSize = Math.min(width, height) * 0.25;
    const textSize = Math.min(width, height) * 0.05;
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#f5f5f7"/>
      <stop offset="100%" style="stop-color:#e5e5e7"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  
  <!-- Centered Logo Container -->
  <g transform="translate(${width/2}, ${height/2 - textSize})">
    <!-- Piano Icon -->
    <g transform="translate(${-logoSize/2}, ${-logoSize/2})">
      <rect width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.18}" fill="#007AFF"/>
      <g fill="#fff" transform="scale(${logoSize/512})">
        <!-- Piano keys -->
        <rect x="80" y="160" width="70" height="200" rx="8"/>
        <rect x="160" y="160" width="70" height="200" rx="8"/>
        <rect x="240" y="160" width="70" height="200" rx="8"/>
        <rect x="320" y="160" width="70" height="200" rx="8"/>
        <rect x="400" y="160" width="32" height="200" rx="8"/>
        <!-- Black keys -->
        <rect x="128" y="160" width="32" height="120" rx="4" fill="#1d1d1f"/>
        <rect x="208" y="160" width="32" height="120" rx="4" fill="#1d1d1f"/>
        <rect x="368" y="160" width="32" height="120" rx="4" fill="#1d1d1f"/>
      </g>
    </g>
    
    <!-- App Name -->
    <text y="${logoSize/2 + textSize * 1.8}" 
          font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" 
          font-size="${textSize}" 
          font-weight="600" 
          fill="#1d1d1f" 
          text-anchor="middle">PianoPlanner</text>
  </g>
</svg>`;
}

async function generateSplashScreens() {
    console.log('🎨 Generating iOS splash screens...\n');
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    for (const screen of SPLASH_SCREENS) {
        const svg = createSplashSVG(screen.width, screen.height);
        const outputPath = path.join(OUTPUT_DIR, screen.name);
        
        try {
            await sharp(Buffer.from(svg))
                .png()
                .toFile(outputPath);
            
            console.log(`✅ Generated: ${screen.name} (${screen.width}x${screen.height})`);
        } catch (err) {
            console.error(`❌ Failed: ${screen.name} - ${err.message}`);
        }
    }
    
    console.log('\n✨ All splash screens generated!');
    console.log(`📁 Output: ${OUTPUT_DIR}`);
}

generateSplashScreens().catch(console.error);

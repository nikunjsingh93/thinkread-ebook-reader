import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.join(__dirname, 'public', 'logo.svg');
const androidResPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

// Icon sizes for different densities
const iconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Create directories
Object.keys(iconSizes).forEach(density => {
  const dir = path.join(androidResPath, density);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Convert SVG to temporary PNG
const tempPng = path.join(__dirname, 'temp-logo.png');
try {
  execSync(`qlmanage -t -s 512 -o "${__dirname}" "${logoPath}"`, { stdio: 'ignore' });
  const qlOutput = path.join(__dirname, 'logo.svg.png');
  if (fs.existsSync(qlOutput)) {
    fs.renameSync(qlOutput, tempPng);
  }
} catch (e) {
  console.error('Failed to convert SVG:', e.message);
  process.exit(1);
}

// Generate icons for each density
Object.entries(iconSizes).forEach(([density, size]) => {
  const outputPath = path.join(androidResPath, density, 'ic_launcher.png');
  const roundPath = path.join(androidResPath, density, 'ic_launcher_round.png');
  
  try {
    execSync(`sips -z ${size} ${size} "${tempPng}" --out "${outputPath}"`, { stdio: 'ignore' });
    execSync(`sips -z ${size} ${size} "${tempPng}" --out "${roundPath}"`, { stdio: 'ignore' });
    console.log(`✓ Created ${density} icons (${size}x${size})`);
  } catch (e) {
    console.error(`✗ Failed to create ${density} icons:`, e.message);
  }
});

// Clean up
if (fs.existsSync(tempPng)) {
  fs.unlinkSync(tempPng);
}

console.log('✓ Android icons created successfully!');


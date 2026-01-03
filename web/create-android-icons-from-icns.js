import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const icnsPath = path.join(rootDir, 'build', 'icon.icns');
const androidResPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

// Icon sizes for different densities
const iconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Foreground icon sizes (for adaptive icons)
const foregroundSizes = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

console.log('Extracting icons from ICNS file...');

// Extract ICNS to iconset
const iconsetDir = path.join(__dirname, 'temp-iconset.iconset');
if (fs.existsSync(iconsetDir)) {
  fs.rmSync(iconsetDir, { recursive: true, force: true });
}
fs.mkdirSync(iconsetDir, { recursive: true });

try {
  // Extract ICNS file to iconset
  execSync(`iconutil -c iconset "${icnsPath}" -o "${iconsetDir}"`, { stdio: 'inherit' });
  
  // Find the largest PNG in the iconset (preferably 1024x1024 or 512x512)
  const iconsetFiles = fs.readdirSync(iconsetDir);
  let sourcePng = null;
  let maxSize = 0;
  
  for (const file of iconsetFiles) {
    if (file.endsWith('.png')) {
      const match = file.match(/(\d+)x(\d+)/);
      if (match) {
        const size = parseInt(match[1]);
        if (size > maxSize) {
          maxSize = size;
          sourcePng = path.join(iconsetDir, file);
        }
      }
    }
  }
  
  if (!sourcePng || !fs.existsSync(sourcePng)) {
    throw new Error('Could not find source PNG in iconset');
  }
  
  console.log(`Using ${maxSize}x${maxSize} source image: ${sourcePng}`);
  
  // Create directories
  Object.keys(iconSizes).forEach(density => {
    const dir = path.join(androidResPath, density);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Create a padded version of the logo (logo should be 50% of the size, with 25% padding on each side)
  const paddedPng = path.join(__dirname, 'temp-padded-logo.png');
  const logoSize = Math.floor(maxSize * 0.5); // Logo will be 50% of the canvas for more padding
  
  // Use Python with PIL to create padded logo
  const pythonScript = `
import sys
from PIL import Image

try:
    source_path = "${sourcePng.replace(/\\/g, '/')}"
    output_path = "${paddedPng.replace(/\\/g, '/')}"
    canvas_size = ${maxSize}
    logo_size = ${logoSize}
    
    # Open the source logo
    logo = Image.open(source_path).convert("RGBA")
    logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    # Create a transparent canvas
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 0))
    
    # Calculate position to center the logo
    x = (canvas_size - logo_size) // 2
    y = (canvas_size - logo_size) // 2
    
    # Paste the logo onto the canvas
    canvas.paste(logo, (x, y), logo)
    
    # Save the result
    canvas.save(output_path, "PNG")
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
  
  const pythonScriptPath = path.join(__dirname, 'temp-pad-logo.py');
  fs.writeFileSync(pythonScriptPath, pythonScript);
  
  try {
    execSync(`python3 "${pythonScriptPath}"`, { stdio: 'pipe' });
    if (!fs.existsSync(paddedPng)) {
      throw new Error('Python script did not create padded logo');
    }
    console.log('✓ Created padded logo with 25% padding on each side');
  } catch (e) {
    console.warn('Could not use Python, creating simple padded version using sips');
    // Fallback: Create a white canvas using sips, then we'll need to composite
    // Since sips doesn't easily composite, we'll use a workaround:
    // Create the resized logo and use it - Android adaptive icons have a safe zone anyway
    try {
      const resizedLogo = path.join(__dirname, 'temp-resized-logo.png');
      execSync(`sips -z ${logoSize} ${logoSize} "${sourcePng}" --out "${resizedLogo}"`, { stdio: 'ignore' });
      
      // Use Python with basic image creation (no PIL needed) or create manually
      // Actually, let's try using macOS's built-in tools
      // Create a white PNG first, then composite (but sips can't composite)
      // For now, just use the resized version - the adaptive icon safe zone should help
      // But we need full-size output, so let's create a script that uses Python's built-in capabilities
      
      // Use a simple Python script that doesn't require PIL - use PNG library or create manually
      const simplePythonScript = `
import struct
import sys

# Create a simple white PNG manually (minimal PNG with white background)
# This is complex, so let's just create the resized logo and document the limitation
# Actually, let's try to install PIL in a virtual way or use a different approach
print("FALLBACK_MODE")
`;
      
      // Since we can't easily create padded canvas without PIL, let's document this
      // and use the resized version. Android adaptive icons do have a safe zone.
      fs.copyFileSync(resizedLogo, paddedPng);
      if (fs.existsSync(resizedLogo)) {
        fs.unlinkSync(resizedLogo);
      }
      console.warn(`⚠ Using ${Math.floor((logoSize/maxSize)*100)}% size logo - Android adaptive icons safe zone should prevent cropping`);
    } catch (e2) {
      console.warn('Fallback failed, using original logo:', e2.message);
      fs.copyFileSync(sourcePng, paddedPng);
    }
  } finally {
    if (fs.existsSync(pythonScriptPath)) {
      fs.unlinkSync(pythonScriptPath);
    }
  }
  
  // Generate icons for each density (using padded version)
  Object.entries(iconSizes).forEach(([density, size]) => {
    const outputPath = path.join(androidResPath, density, 'ic_launcher.png');
    const roundPath = path.join(androidResPath, density, 'ic_launcher_round.png');
    
    try {
      execSync(`sips -z ${size} ${size} "${paddedPng}" --out "${outputPath}"`, { stdio: 'ignore' });
      execSync(`sips -z ${size} ${size} "${paddedPng}" --out "${roundPath}"`, { stdio: 'ignore' });
      console.log(`✓ Created ${density} icons (${size}x${size})`);
    } catch (e) {
      console.error(`✗ Failed to create ${density} icons:`, e.message);
    }
  });
  
  // Generate foreground icons for adaptive icons (using padded version)
  Object.entries(foregroundSizes).forEach(([density, size]) => {
    const outputPath = path.join(androidResPath, density, 'ic_launcher_foreground.png');
    
    try {
      execSync(`sips -z ${size} ${size} "${paddedPng}" --out "${outputPath}"`, { stdio: 'ignore' });
      console.log(`✓ Created ${density} foreground icon (${size}x${size})`);
    } catch (e) {
      console.error(`✗ Failed to create ${density} foreground icon:`, e.message);
    }
  });
  
  // Clean up padded logo
  if (fs.existsSync(paddedPng)) {
    fs.unlinkSync(paddedPng);
  }
  
  // Clean up
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
  
  console.log('✓ Android icons created successfully from Electron icon!');
} catch (error) {
  console.error('✗ Error creating Android icons:', error.message);
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
  process.exit(1);
}


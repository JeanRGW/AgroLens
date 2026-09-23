const fs = require('fs');
const path = require('path');
const sharp = require('../backend/node_modules/sharp');

const rootDir = path.resolve(__dirname, '..');
const src = path.join(rootDir, 'mobile/assets/app_icon.png');

async function generate() {
  if (!fs.existsSync(src)) {
    throw new Error(`Source icon not found at: ${src}`);
  }

  // 1. Android ic_launcher sizes
  const androidTargets = [
    { dir: 'mobile/android/app/src/main/res/mipmap-mdpi', size: 48 },
    { dir: 'mobile/android/app/src/main/res/mipmap-hdpi', size: 72 },
    { dir: 'mobile/android/app/src/main/res/mipmap-xhdpi', size: 96 },
    { dir: 'mobile/android/app/src/main/res/mipmap-xxhdpi', size: 144 },
    { dir: 'mobile/android/app/src/main/res/mipmap-xxxhdpi', size: 192 },
  ];

  for (const { dir, size } of androidTargets) {
    const fullDir = path.join(rootDir, dir);
    fs.mkdirSync(fullDir, { recursive: true });
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(fullDir, 'ic_launcher.png'));
    console.log('Generated Android icon:', path.join(dir, 'ic_launcher.png'), `(${size}x${size})`);
  }

  // 2. iOS AppIcon assets
  const iosTargets = [
    { name: 'Icon-App-20x20@1x.png', size: 20 },
    { name: 'Icon-App-20x20@2x.png', size: 40 },
    { name: 'Icon-App-20x20@3x.png', size: 60 },
    { name: 'Icon-App-29x29@1x.png', size: 29 },
    { name: 'Icon-App-29x29@2x.png', size: 58 },
    { name: 'Icon-App-29x29@3x.png', size: 87 },
    { name: 'Icon-App-40x40@1x.png', size: 40 },
    { name: 'Icon-App-40x40@2x.png', size: 80 },
    { name: 'Icon-App-40x40@3x.png', size: 120 },
    { name: 'Icon-App-60x60@2x.png', size: 120 },
    { name: 'Icon-App-60x60@3x.png', size: 180 },
    { name: 'Icon-App-76x76@1x.png', size: 76 },
    { name: 'Icon-App-76x76@2x.png', size: 152 },
    { name: 'Icon-App-83.5x83.5@2x.png', size: 167 },
    { name: 'Icon-App-1024x1024@1x.png', size: 1024 },
  ];
  const iosDir = path.join(rootDir, 'mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset');
  if (fs.existsSync(iosDir)) {
    for (const { name, size } of iosTargets) {
      await sharp(src)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(iosDir, name));
      console.log('Generated iOS icon:', name, `(${size}x${size})`);
    }
  }

  // 3. Web + PWA icons
  const webPublic = path.join(rootDir, 'web/public');
  const webIcons = path.join(rootDir, 'web/public/icons');
  fs.mkdirSync(webIcons, { recursive: true });

  // Favicon PNG (32x32)
  await sharp(src)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(webPublic, 'favicon.png'));
  console.log('Generated web/public/favicon.png (32x32)');

  // Apple touch icon (180x180)
  await sharp(src)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(webPublic, 'apple-touch-icon.png'));
  console.log('Generated web/public/apple-touch-icon.png (180x180)');

  // Standard PWA icons (192x192, 512x512)
  await sharp(src)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(webIcons, 'icon-192.png'));
  console.log('Generated web/public/icons/icon-192.png (192x192)');

  await sharp(src)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(webIcons, 'icon-512.png'));
  console.log('Generated web/public/icons/icon-512.png (512x512)');

  // Maskable PWA icons (with ~15% safe padding around the circular icon on #264b2f background)
  const maskable512Buffer = await sharp(src)
    .resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 38, g: 75, b: 47, alpha: 1 }, // #264b2f theme color
    },
  })
    .composite([{ input: maskable512Buffer, gravity: 'center' }])
    .png()
    .toFile(path.join(webIcons, 'icon-maskable-512.png'));
  console.log('Generated web/public/icons/icon-maskable-512.png (512x512)');

  const maskable192Buffer = await sharp(src)
    .resize(154, 154, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 38, g: 75, b: 47, alpha: 1 }, // #264b2f theme color
    },
  })
    .composite([{ input: maskable192Buffer, gravity: 'center' }])
    .png()
    .toFile(path.join(webIcons, 'icon-maskable-192.png'));
  console.log('Generated web/public/icons/icon-maskable-192.png (192x192)');

  // SVG representation with embedded high-res base64 PNG
  const base64Png = fs.readFileSync(src).toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,${base64Png}" width="512" height="512"/>
</svg>
`;

  fs.writeFileSync(path.join(webPublic, 'favicon.svg'), svgContent);
  fs.writeFileSync(path.join(webIcons, 'icon-192.svg'), svgContent);
  fs.writeFileSync(path.join(webIcons, 'icon-512.svg'), svgContent);
  console.log('Generated SVG wrappers (favicon.svg, icon-192.svg, icon-512.svg)');

  // 4. Web favicon.ico generation
  async function generateIco(outputPath, sizes) {
    const pngBuffers = [];
    for (const size of sizes) {
      const buf = await sharp(src)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      pngBuffers.push({ size, buffer: buf });
    }

    const count = pngBuffers.length;
    const headerSize = 6;
    const entrySize = 16;
    let offset = headerSize + count * entrySize;

    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0); // Reserved
    header.writeUInt16LE(1, 2); // ICO type
    header.writeUInt16LE(count, 4); // Number of images

    const entries = [];
    for (const { size, buffer } of pngBuffers) {
      const entry = Buffer.alloc(entrySize);
      entry.writeUInt8(size >= 256 ? 0 : size, 0); // Width
      entry.writeUInt8(size >= 256 ? 0 : size, 1); // Height
      entry.writeUInt8(0, 2); // Color palette count
      entry.writeUInt8(0, 3); // Reserved
      entry.writeUInt16LE(1, 4); // Color planes
      entry.writeUInt16LE(32, 6); // Bits per pixel
      entry.writeUInt32LE(buffer.length, 8); // Image size in bytes
      entry.writeUInt32LE(offset, 12); // Offset
      entries.push(entry);
      offset += buffer.length;
    }

    const icoBuffer = Buffer.concat([
      header,
      ...entries,
      ...pngBuffers.map((p) => p.buffer),
    ]);

    fs.writeFileSync(outputPath, icoBuffer);
    console.log('Generated ICO:', outputPath, `(${sizes.join(', ')})`);
  }

  await generateIco(path.join(webPublic, 'favicon.ico'), [16, 32, 48]);
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

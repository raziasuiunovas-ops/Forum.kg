/**
 * Generates PWA icons from app/icon.svg using sharp.
 * Run once: node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'

const svgContent = readFileSync(join(process.cwd(), 'app/icon.svg'))

const sizes = [192, 512]

for (const size of sizes) {
  // Regular icon
  await sharp(svgContent)
    .resize(size, size)
    .png()
    .toFile(join(process.cwd(), `public/icons/icon-${size}.png`))
  console.log(`Generated icon-${size}.png`)

  // Maskable icon — add 20% padding so logo doesn't get cropped
  const padded = Math.round(size * 0.8)
  const pad = Math.round(size * 0.1)
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 7, g: 11, b: 36, alpha: 1 }, // #070B24
    },
  })
    .composite([{
      input: await sharp(svgContent).resize(padded, padded).png().toBuffer(),
      top: pad,
      left: pad,
    }])
    .png()
    .toFile(join(process.cwd(), `public/icons/icon-maskable-${size}.png`))
  console.log(`Generated icon-maskable-${size}.png`)
}

// Also generate favicon.ico compatible 32px for browsers
await sharp(svgContent)
  .resize(32, 32)
  .png()
  .toFile(join(process.cwd(), 'public/icons/favicon-32.png'))
console.log('Generated favicon-32.png')

console.log('All icons generated!')

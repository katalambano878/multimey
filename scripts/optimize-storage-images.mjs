import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.argv[2];
if (!root) {
  console.error('usage: node optimize-storage-images.mjs <storage-root>');
  process.exit(1);
}

function limitFor(file) {
  return file.includes(`${path.sep}site-assets${path.sep}`) ? 800 : 1600;
}

async function* walk(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const totals = { files: 0, changed: 0, skipped: 0, failed: 0, before: 0, after: 0 };

for await (const file of walk(root)) {
  if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
  const stat = await fs.promises.stat(file);
  totals.files += 1;
  totals.before += stat.size;
  try {
    const meta = await sharp(file, { failOn: 'none' }).metadata();
    const limit = limitFor(file);
    const tooWide = (meta.width || 0) > limit || (meta.height || 0) > limit;
    const tooHeavy = stat.size > 180 * 1024;
    if (!tooWide && !tooHeavy) {
      totals.skipped += 1;
      totals.after += stat.size;
      continue;
    }
    let pipeline = sharp(file, { failOn: 'none' }).rotate();
    if (tooWide) {
      pipeline = pipeline.resize({
        width: limit,
        height: limit,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (ext === '.webp') pipeline = pipeline.webp({ quality: 78 });
    else pipeline = pipeline.jpeg({ quality: 78, mozjpeg: true });
    const buf = await pipeline.toBuffer();
    if (buf.length >= stat.size) {
      totals.skipped += 1;
      totals.after += stat.size;
      continue;
    }
    const tmp = `${file}.opt`;
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, file);
    totals.changed += 1;
    totals.after += buf.length;
  } catch (err) {
    totals.failed += 1;
    totals.after += stat.size;
    console.error('FAIL', path.basename(file), err instanceof Error ? err.message : err);
  }
}

console.log(
  JSON.stringify({
    ...totals,
    beforeMB: (totals.before / 1048576).toFixed(1),
    afterMB: (totals.after / 1048576).toFixed(1),
  })
);

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'app-build');
const assets = path.join(output, 'assets');
const fontsOutput = path.join(assets, 'fontsource');

fs.mkdirSync(assets, { recursive: true });

let html = fs.readFileSync(path.join(root, 'showdeck_pro_v12.html'), 'utf8');

function replaceExactlyOnce(source, pattern, replacement, description) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`Expected exactly one ${description} in the HTML source.`);
  }
  return source.replace(pattern, replacement);
}

html = replaceExactlyOnce(
  html,
  /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/,
  '<link rel="stylesheet" href="assets/app.css" />',
  'Tailwind CDN script'
);

html = replaceExactlyOnce(
  html,
  /<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/,
  `<meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; media-src 'self' data: blob:; worker-src 'self' blob:">`,
  'viewport meta tag'
);

html = replaceExactlyOnce(
  html,
  /  <script>\s*tailwind\.config\s*=\s*\{[\s\S]*?<\/script>/,
  '',
  'Tailwind CDN configuration'
);

html = replaceExactlyOnce(
  html,
  /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/pdf\.min\.js"><\/script>/,
  '',
  'PDF.js CDN script'
);

html = replaceExactlyOnce(
  html,
  /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js"><\/script>/,
  '<script src="assets/jszip.min.js"></script>',
  'JSZip CDN script'
);

html = replaceExactlyOnce(
  html,
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:[^"]+" rel="stylesheet">/,
  '<link rel="stylesheet" href="assets/fonts.css">',
  'Google Fonts links'
);

html = replaceExactlyOnce(
  html,
  /    if \(window\.pdfjsLib\) \{\s*pdfjsLib\.GlobalWorkerOptions\.workerSrc = 'https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/pdf\.worker\.min\.js';\s*\}/,
  "    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', import.meta.url).href;",
  'PDF.js worker configuration'
);

html = replaceExactlyOnce(
  html,
  /  <script>\s*\/\*\*\s*\* SHOWDECK PRO — UNIFIED PRESENTATION & VIDEO CUE ENGINE/,
  "  <script type=\"module\">\n    import * as pdfjsLib from './assets/pdf.min.mjs';\n\n    /**\n     * SHOWDECK PRO — UNIFIED PRESENTATION & VIDEO CUE ENGINE",
  'application script'
);

fs.writeFileSync(path.join(output, 'index.html'), html);

for (const [source, target] of [
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['node_modules/jszip/dist/jszip.min.js', 'jszip.min.js']
]) {
  fs.copyFileSync(path.join(root, source), path.join(assets, target));
}

const fontStyles = [];
for (const [family, weights] of [
  ['inter', ['400', '500', '600', '700', '800']],
  ['jetbrains-mono', ['400', '500', '700']]
]) {
  const packageDir = path.join(root, 'node_modules', '@fontsource', family);
  const familyOutput = path.join(fontsOutput, family);
  const filesOutput = path.join(familyOutput, 'files');
  fs.mkdirSync(filesOutput, { recursive: true });

  for (const weight of weights) {
    const cssName = `${weight}.css`;
    const css = fs.readFileSync(path.join(packageDir, cssName), 'utf8');
    fs.writeFileSync(path.join(familyOutput, cssName), css);

    for (const [, relativeFile] of css.matchAll(/url\((?:["']?)(\.\/files\/[^)'"]+)/g)) {
      const fileName = path.basename(relativeFile);
      fs.copyFileSync(
        path.join(packageDir, relativeFile),
        path.join(filesOutput, fileName)
      );
    }
    fontStyles.push(`@import url("./fontsource/${family}/${cssName}");`);
  }
}

fs.writeFileSync(path.join(assets, 'fonts.css'), `${fontStyles.join('\n')}\n`);

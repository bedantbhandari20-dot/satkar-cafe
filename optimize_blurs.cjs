const fs = require('fs');
const path = require('path');

const appJsxPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

// Ensure we don't double-prefix if it already has md:
content = content.replace(/(?<!md:)backdrop-blur/g, 'md:backdrop-blur');

fs.writeFileSync(appJsxPath, content, 'utf8');
console.log('Optimized blurs for mobile.');

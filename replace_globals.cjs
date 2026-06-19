const fs = require('fs');
const path = require('path');

const appJsxPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

content = content.replace(/window\.__db/g, '__db');
content = content.replace(/window\.__sessionId/g, '__sessionId');
content = content.replace(/window\.__storage/g, '__storage');

fs.writeFileSync(appJsxPath, content, 'utf8');
console.log('Successfully replaced global variables.');

const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');
content = content.replace(/ asChild/g, '');
content = content.replace(/<Tooltip delayDuration={0}>/g, '<Tooltip>');
fs.writeFileSync('src/App.tsx', content);

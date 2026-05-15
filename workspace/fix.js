const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');
content = content.replace(/ asChild/g, '');
content = content.replace(/<Tooltip delayDuration={0}>/g, '<TooltipProvider delay={0}><Tooltip>');
content = content.replace(/<\/Tooltip>/g, '</Tooltip></TooltipProvider>');
fs.writeFileSync('src/App.tsx', content);

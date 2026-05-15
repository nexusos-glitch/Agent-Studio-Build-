const fs = require('fs');
let content = fs.readFileSync('/app/applet/src/App.tsx', 'utf-8');

// The file currently has `<Tooltip delayDuration={0}>` because my previous replace failed to match it, maybe due to newlines/tabs? No, it matched `</Tooltip>` but not the opening. Let's fix that.
content = content.replace(/<Tooltip delayDuration={0}>/g, '<TooltipProvider delay={0}><Tooltip>');

// If the previous script mistakenly added `</TooltipProvider>` to all `</Tooltip>`, we should check.
// I will just read the file and fix it using standard regex.
content = content.replace(/<\/Tooltip><\/TooltipProvider><\/TooltipProvider>/g, '</Tooltip></TooltipProvider>');

// But wait, the previous replace failed because `<Tooltip delayDuration={0}>` might have spaces. 
content = content.replace(/<Tooltip\s+delayDuration=\{0\}>/g, '<TooltipProvider delay={0}><Tooltip>');

fs.writeFileSync('/app/applet/src/App.tsx', content);

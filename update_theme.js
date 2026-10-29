const fs = require('fs');
const path = './index.html';

let content = fs.readFileSync(path, 'utf8');

// Color mapping
const replacements = {
    '#087a4d': '#511C87', // Primary green to Primary Purple
    '#06663f': '#3D1565', // Hover green to Hover Purple
    '#0ca76b': '#7E34CC', // Lighter green to Lighter purple
    '#00A859': '#661BB5', // Checkmark green to purple
    'rgba(8, 122, 77, 0.85)': 'rgba(81, 28, 135, 0.85)', // Login overlay
    'rgba(17, 29, 24, 0.95)': 'rgba(30, 20, 40, 0.95)', // Login overlay dark
    '#f4f7f5': '#F7F8FA', // Body background
    '#111d18': '#160924', // Auth visual bg / Virtual card dark
    '#17231d': '#1D1A21', // Main text
    '#d8e1dc': '#E0E0E5', // Border color
    '#66736c': '#6B6870', // Subtitle text
    '#07905b': '#6523A8', // Input focus
    '#fff4d8': '#F5F2FF', // Message bg
    '#6b5011': '#311059', // Message text
    '#e2e9e5': '#E4E4EB', // Header border
    '#e4ebe7': '#E6E6ED', // Panel border
    '#edf1ef': '#F0F0F5', // Info row border
    '#718078': '#7A7682', // Stat label
    '#738078': '#7A7682', // Info label
    '#68756e': '#6F6B75', // Request card p
    '#6e7b74': '#75717A', // Table th
    '#f0f4f2': '#F2F0F5', // Tabs nav bg
    '#5a6b63': '#635D6B', // Tab btn color
    '#e8f7ef': '#EFE8F7', // Requested status bg
    '#f7faf8': '#F9F8FA', // Table hover
    '#eef8f3': '#F0E8F7', // Selected row
    '#00462d': '#280A47', // Box shadow colors
    '0 18px 40px rgba(0, 70, 45, .25)': '0 18px 40px rgba(81, 28, 135, .35)', // Card shadow
    '#0b9a63': '#7E2BE6', // Balance panel gradient
};

for (const [oldColor, newColor] of Object.entries(replacements)) {
    // Escape regex characters if any (rgba has parentheses)
    const regex = new RegExp(oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    content = content.replace(regex, newColor);
}

// Add a modern font
content = content.replace(
    'font-family: Arial, Helvetica, sans-serif;',
    'font-family: "Inter", "Roboto", "Helvetica Neue", Arial, sans-serif;'
);

// Add the font link to head
if (!content.includes('fonts.googleapis.com')) {
    content = content.replace(
        '<title>VeraTransfers</title>',
        `<title>VeraTransfers</title>\n    <link rel="preconnect" href="https://fonts.googleapis.com">\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`
    );
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated index.html with Zelle-like theme.');

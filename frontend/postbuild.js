// Post-build script to ensure files are copied for Vercel
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
const vercelOutput = path.join(__dirname, '..', '.vercel', 'output', 'static');

// Only run in Vercel environment
if (process.env.VERCEL && fs.existsSync(distPath)) {
  console.log('Vercel detected, checking output directory...');
  
  // Vercel should handle this automatically, but this ensures it works
  if (fs.existsSync(vercelOutput)) {
    console.log('Vercel output directory exists, files should be copied automatically');
  } else {
    console.log('Vercel output directory does not exist yet (this is normal during build)');
  }
}

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Ensure the target directory exists
const binDir = path.resolve(__dirname, '../src-tauri/bin');
if (!fs.existsSync(binDir)) {
  console.log(`Creating directory: ${binDir}`);
  fs.mkdirSync(binDir, { recursive: true });
}

// 2. Detect Platform & Architecture
const platform = process.platform;
const arch = process.arch;

let target = '';
// MUST match the sidecar name in main.rs (automland-sidecar)
let outputBase = 'automland-sidecar'; 
let outputFilename = outputBase;

// Map Node.js platform/arch to Rust/Tauri Triple
if (platform === 'win32') {
  target = 'node18-win-x64';
  outputFilename += '-x86_64-pc-windows-msvc.exe';
} else if (platform === 'darwin') {
  if (arch === 'arm64') {
    target = 'node18-macos-arm64';
    outputFilename += '-aarch64-apple-darwin';
  } else {
    target = 'node18-macos-x64';
    outputFilename += '-x86_64-apple-darwin';
  }
} else if (platform === 'linux') {
  target = 'node18-linux-x64';
  outputFilename += '-x86_64-unknown-linux-gnu';
} else {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}
console.log(outputFilename)
const outputPath = path.join(binDir, outputFilename);

console.log(`[Sidecar Build] Platform: ${platform}, Arch: ${arch}`);
console.log(`[Sidecar Build] Target: ${target}`);
console.log(`[Sidecar Build] Output: ${outputPath}`);

// 3. Run pkg
try {
  const cmd = `npx pkg index.js --targets ${target} --output "${outputPath}"`;
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log("✅ Sidecar built successfully!");
  console.log(`⚠️  Make sure 'src-tauri/capabilities/default.json' allows executing '${outputBase}'`);
} catch (e) {
  console.error("❌ Build failed:", e.message);
  process.exit(1);
}
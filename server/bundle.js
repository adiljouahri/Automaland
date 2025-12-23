
const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

function copyFolderRecursive(src, dest) {
  try {
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`Successfully copied folder from '${src}' to '${dest}'.`);
  } catch (err) {
    console.error(`Error copying folder: ${err.message}`);
    process.exit(1); 
  }
}

async function bundle() {
    console.log("🧹 Cleaning dist...");
    await fs.remove('dist');
    await fs.ensureDir('dist');

    console.log("📦 Bundling Server...");
    
    // esbuild configuration
    await esbuild.build({
        entryPoints: ['index.js'],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs', 
        outfile: 'dist/server-sidecar.cjs', 
        // Mark .node files as external so esbuild doesn't try to bundle/rename them.
        // We will load them dynamically from the copied 'lib' folder.
        external: ['fsevents', '*.node'], 
    });

    // --- COPY FULL LIB FOLDER (Native Modules) ---
    console.log("📦 Copying Lib Folder...");
    const srcLib = path.join(__dirname, 'lib');
    const destLib = path.join(__dirname, 'dist', 'lib');
    
    // if (fs.existsSync(srcLib)) {
    //     copyFolderRecursive(srcLib, destLib);
    // } else {
    //     console.warn("⚠️ 'lib' folder not found in server root.");
    // }

    // --- COPY JSX FOLDER (Standard Scripts) ---
    console.log("📦 Copying JSX Folder...");
    const srcJsx = path.join(__dirname, 'jsx');
    const destJsx = path.join(__dirname, 'dist', 'jsx');
    console.log(srcJsx)
    if (fs.existsSync(srcJsx)) {
        copyFolderRecursive(srcJsx, destJsx);
    } else {
        console.warn("⚠️ 'jsx' folder not found in server root. (Optional if not using custom standard libs)");
    }

    console.log("✅ Build Complete: dist/server-sidecar.cjs");

    // --- AUTOMATIC COPY FOR TAURI DEV ---
    const debugTarget = path.resolve(__dirname, '../src-tauri/target/debug');
    
    console.log(`⚡ Copying to Tauri Debug Target: ${debugTarget}`);
    
    try {
        // Ensure directory exists
        await fs.ensureDir(debugTarget);

        // Copy the main JS bundle
        await fs.copy('dist/server-sidecar.cjs', path.join(debugTarget, 'server-sidecar.cjs'));
        
        // Copy the full lib folder to the target as well
        const debugLib = path.join(debugTarget, 'lib');
        if (fs.existsSync(destLib)) {
             copyFolderRecursive(destLib, debugLib);
        }

        // Copy the full jsx folder to the target as well
        const debugJsx = path.join(debugTarget, 'jsx');
        if (fs.existsSync(destJsx)) {
             copyFolderRecursive(destJsx, debugJsx);
        }

        console.log("   -> Copied successfully.");
    } catch (e) {
        console.warn("   -> Copy failed:", e.message);
        console.warn("   -> You may need to run 'cargo build' once to create the target directory, or the file is locked.");
    }
}

bundle().catch((e) => {
    console.error(e);
    process.exit(1);
});


const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

function copyFolderRecursive(src, dest) {
  try {
    // Ensure destination directory exists before copying
    fs.ensureDirSync(dest);
    
    fs.copySync(src, dest, { 
        overwrite: true, 
        dereference: true,
        filter: (src, dest) => {
            // Optional: Filter logic if needed, currently allowing everything
            return true;
        }
    });
    console.log(`Successfully copied folder from '${src}' to '${dest}'.`);
    
    // Debug: List files to ensure .node files are present
    if (fs.existsSync(dest)) {
        const files = fs.readdirSync(dest);
        console.log(`Contents of ${dest}:`, files.slice(0, 10)); 
    }
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
    
    if (fs.existsSync(srcLib)) {
        // Explicitly ensure the destination folder exists
        fs.ensureDirSync(destLib);
        copyFolderRecursive(srcLib, destLib);
    } else {
        console.warn("⚠️ 'lib' folder not found in server root.");
    }

    // --- COPY JSX FOLDER (Standard Scripts) ---
    console.log("📦 Copying JSX Folder...");
    const srcJsx = path.join(__dirname, 'jsx');
    const destJsx = path.join(__dirname, 'dist', 'jsx');
    
    if (fs.existsSync(srcJsx)) {
        fs.ensureDirSync(destJsx);
        copyFolderRecursive(srcJsx, destJsx);
    } else {
        console.warn("⚠️ 'jsx' folder not found in server root. (Optional if not using custom standard libs)");
    }

    console.log("✅ Build Complete: dist/server-sidecar.cjs");

    // --- AUTOMATIC COPY FOR TAURI DEV ---
    // This helps when running 'npm run tauri dev'
    const debugTarget = path.resolve(__dirname, '../src-tauri/target/debug');
    
    // Only try copy if debug target exists (meaning we've run tauri dev/build at least once)
    if (fs.existsSync(debugTarget)) {
        console.log(`⚡ Copying to Tauri Debug Target: ${debugTarget}`);
        try {
            await fs.copy('dist/server-sidecar.cjs', path.join(debugTarget, 'server-sidecar.cjs'));
            
            const debugLib = path.join(debugTarget, 'lib');
            if (fs.existsSync(destLib)) {
                //  await fs.copy(destLib, debugLib, { overwrite: true });
            }

            const debugJsx = path.join(debugTarget, 'jsx');
            if (fs.existsSync(destJsx)) {
                 await fs.copy(destJsx, debugJsx, { overwrite: true });
            }
            console.log("   -> Copied successfully.");
        } catch (e) {
            console.warn("   -> Copy failed (Debug Target):", e.message);
        }
    }
}

bundle().catch((e) => {
    console.error(e);
    process.exit(1);
});

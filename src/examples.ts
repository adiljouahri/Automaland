import { AutomationFlow } from './types';
import { INITIAL_UI_SCHEMA, INITIAL_NODE_CODE, INITIAL_APP_CODE } from './constants';

const createExample = (
  id: string, 
  name: string, 
  targetApp: string, 
  description: string,
  uiSchema: object,
  nodeCode: string,
  appCode: string
): AutomationFlow => ({
  id: `example-${id}`,
  flowId: `uuid-${id}`,
  name,
  targetApp,
  uiSchema: JSON.stringify(uiSchema, null, 2),
  nodeCode,
  appCode,
  isPublic: false,
  createdAt: Date.now(),
  chatHistory: [{
    id: 'init',
    role: 'model',
    text: description,
    timestamp: new Date()
  }],
  history: [],
  executionTimeout: 30,
  savedFormData: {}
});

export const EXAMPLE_FLOWS: AutomationFlow[] = [
  // --- PHOTOSHOP EXAMPLES ---
  createExample(
    'ps-1', 'Batch Watermark & Resize', 'photoshop',
    'Watches a folder, resizes images to 1080p, adds a text watermark, and saves to output.',
    {
      type: "object",
      properties: {
        inputFolder: { type: "string", title: "Input Folder", format: "folder" },
        outputFolder: { type: "string", title: "Output Folder", format: "folder" },
        watermarkText: { type: "string", title: "Watermark Text", default: "DRAFT" }
      }
    },
    `const fs = require('fs');
const path = require('path');

exports.run = async (data) => {
  const files = fs.readdirSync(data.inputFolder).filter(f => f.match(/\\.(jpg|jpeg|png)$/i));
  utils.setUI('status', \`Found \${files.length} images\`);
  
  for (const file of files) {
    const fullPath = path.join(data.inputFolder, file);
    const outPath = path.join(data.outputFolder, file);
    
    await $.run_jsx(\`
      open(File("\${fullPath.replace(/\\\\/g, '/')}"));
      var doc = app.activeDocument;
      doc.resizeImage(UnitValue(1920, "px"), null, 72, ResampleMethod.BICUBIC);
      
      var layer = doc.artLayers.add();
      layer.kind = LayerKind.TEXT;
      layer.textItem.contents = "\${data.watermarkText}";
      layer.textItem.size = 40;
      layer.textItem.position = [doc.width/2, doc.height/2];
      
      var opts = new JPEGSaveOptions();
      opts.quality = 8;
      doc.saveAs(File("\${outPath.replace(/\\\\/g, '/')}"), opts, true);
      doc.close(SaveOptions.DONOTSAVECHANGES);
    \`);
  }
  return { success: true };
};`,
    `// Host App Code`
  ),
  createExample(
    'ps-2', 'Mockup Replacer', 'photoshop',
    'Replaces the contents of a Smart Object named "PLACEHOLDER" with a selected image.',
    {
      type: "object",
      properties: {
        mockupFile: { type: "string", title: "Mockup PSD", format: "file" },
        designFile: { type: "string", title: "Design Image", format: "file" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    open(File("\${data.mockupFile.replace(/\\\\/g, '/')}"));
    var doc = app.activeDocument;
    
    function findLayer(layers, name) {
        for(var i=0; i<layers.length; i++) {
            if(layers[i].name === name) return layers[i];
            if(layers[i].typename === "LayerSet") {
                var found = findLayer(layers[i].layers, name);
                if(found) return found;
            }
        }
        return null;
    }
    
    var so = findLayer(doc.layers, "PLACEHOLDER");
    if(so && so.kind === LayerKind.SMARTOBJECT) {
        doc.activeLayer = so;
        // Note: Replacing SO content via script is complex in vanilla ES3, 
        // usually requires ActionManager code. This is a simplified placeholder.
        alert("Found Smart Object: " + so.name + ". Ready to replace with " + "\${data.designFile}");
    } else {
        alert("Layer 'PLACEHOLDER' not found.");
    }
  \`);
};`,
    `// Helper functions`
  ),
  createExample(
    'ps-3', 'Export Layers to PNG', 'photoshop',
    'Exports all top-level layers of the active document as separate PNG files.',
    {
      type: "object",
      properties: {
        outputDir: { type: "string", title: "Export Location", format: "folder" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var outDir = "\${data.outputDir.replace(/\\\\/g, '/')}/";
    
    for(var i=0; i<doc.layers.length; i++) {
        var layer = doc.layers[i];
        layer.visible = true;
        // Hide others
        for(var j=0; j<doc.layers.length; j++) {
            if(i !== j) doc.layers[j].visible = false;
        }
        
        var opts = new PNGSaveOptions();
        doc.saveAs(File(outDir + layer.name + ".png"), opts, true);
    }
    // Restore visibility
    for(var i=0; i<doc.layers.length; i++) doc.layers[i].visible = true;
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-4', 'Metadata Tagger', 'photoshop',
    'Adds copyright and description metadata to an image.',
    {
      type: "object",
      properties: {
        copyright: { type: "string", title: "Copyright Notice", default: "© 2024" },
        desc: { type: "string", title: "Description", default: "Processed Asset" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    if(app.documents.length > 0) {
        var doc = app.activeDocument;
        doc.info.copyrightNotice = "\${data.copyright}";
        doc.info.caption = "\${data.desc}";
        doc.info.copyrighted = CopyrightedType.COPYRIGHTEDWORK;
        alert("Metadata updated!");
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-5', 'Social Media Cropper', 'photoshop',
    'Crops the active image to Square (1:1) and Story (9:16) formats.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var initialState = doc.activeHistoryState;
    
    // 1. Square
    doc.resizeCanvas(Math.min(doc.width, doc.height), Math.min(doc.width, doc.height), AnchorPosition.MIDDLECENTER);
    // Save logic here...
    
    doc.activeHistoryState = initialState; // Undo
    
    // 2. Story
    // Logic for 9:16 crop...
    alert("Crops generated (Simulation)");
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-6', 'Contact Sheet Builder', 'photoshop',
    'Places all images from a folder into a grid in a new document.',
    {
      type: "object",
      properties: {
        folder: { type: "string", title: "Image Folder", format: "folder" }
      }
    },
    `exports.run = async (data) => {
  // Node logic to read files, then loop and place in PS
  const fs = require('fs');
  const files = fs.readdirSync(data.folder).filter(f => f.match(/jpg|png/));
  
  await $.run_jsx(\`
    var doc = app.documents.add(2000, 2000);
    // Logic to place files in grid...
    alert("Contact sheet created for \${files.length} images.");
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-7', 'Text Translator', 'photoshop',
    'Finds a text layer by name and updates its content.',
    {
      type: "object",
      properties: {
        layerName: { type: "string", title: "Layer Name", default: "Headline" },
        newText: { type: "string", title: "New Text", default: "Hola Mundo" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    try {
        var layer = app.activeDocument.artLayers.getByName("\${data.layerName}");
        if(layer.kind == LayerKind.TEXT) {
            layer.textItem.contents = "\${data.newText}";
        }
    } catch(e) { alert("Layer not found"); }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-8', 'Remove Background', 'photoshop',
    'Uses the "Select Subject" action (via ActionManager) to mask the subject.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    // ActionManager code to run "Select Subject"
    var idautoCutout = stringIDToTypeID( "autoCutout" );
    var desc = new ActionDescriptor();
    var idsampleAllLayers = stringIDToTypeID( "sampleAllLayers" );
    desc.putBoolean( idsampleAllLayers, false );
    try {
        executeAction( idautoCutout, desc, DialogModes.NO );
        app.activeDocument.selection.invert();
        app.activeDocument.selection.clear();
        app.activeDocument.selection.deselect();
    } catch(e) { alert("Select Subject failed"); }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-9', 'Texture Overlay', 'photoshop',
    'Places a texture file on top of the stack and sets blending mode to Overlay.',
    {
      type: "object",
      properties: {
        texture: { type: "string", title: "Texture File", format: "file" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var file = File("\${data.texture.replace(/\\\\/g, '/')}");
    placeFile(file); // Custom function needed for 'place'
    doc.activeLayer.blendMode = BlendMode.OVERLAY;
    doc.activeLayer.opacity = 50;
    
    function placeFile(file) {
        var idPlc = charIDToTypeID( "Plc " );
        var desc = new ActionDescriptor();
        var idnull = charIDToTypeID( "null" );
        desc.putPath( idnull, file );
        executeAction( idPlc, desc, DialogModes.NO );
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ps-10', 'Save for Web (Batch)', 'photoshop',
    'Batch saves open documents using Save for Web (Legacy) settings.',
    { type: "object", properties: { output: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    while(app.documents.length > 0) {
        var doc = app.activeDocument;
        var opts = new ExportOptionsSaveForWeb();
        opts.format = SaveDocumentType.JPEG;
        opts.quality = 60;
        
        var f = new File("\${data.output.replace(/\\\\/g, '/')}/" + doc.name + ".jpg");
        doc.exportDocument(f, ExportType.SAVEFORWEB, opts);
        doc.close(SaveOptions.DONOTSAVECHANGES);
    }
  \`);
};`,
    `// Host Code`
  ),

  // --- ILLUSTRATOR EXAMPLES ---
  createExample(
    'ai-1', 'Business Card Generator', 'illustrator',
    'Updates text variables for Name/Title and saves as PDF.',
    {
      type: "object",
      properties: {
        name: { type: "string", title: "Full Name", default: "John Doe" },
        title: { type: "string", title: "Job Title", default: "Designer" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    // Assume text frames are named "name_field" and "title_field"
    try { doc.textFrames.getByName("name_field").contents = "\${data.name}"; } catch(e){}
    try { doc.textFrames.getByName("title_field").contents = "\${data.title}"; } catch(e){}
    
    var opts = new PDFSaveOptions();
    doc.saveAs(File(doc.path + "/" + "\${data.name}" + "_Card.pdf"), opts);
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-2', 'Export Artboards to SVG', 'illustrator',
    'Exports each artboard as a separate SVG file.',
    { type: "object", properties: { outDir: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var dest = "\${data.outDir.replace(/\\\\/g, '/')}";
    
    for(var i=0; i<doc.artboards.length; i++) {
        doc.artboards.setActiveArtboardIndex(i);
        var abName = doc.artboards[i].name;
        var file = new File(dest + "/" + abName + ".svg");
        
        var opts = new ExportOptionsSVG();
        opts.saveMultipleArtboards = true;
        opts.artboardRange = (i+1).toString();
        
        doc.exportFile(file, ExportType.SVG, opts);
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-3', 'QR Code Placer', 'illustrator',
    'Generates a QR code using a public API and places it in Illustrator.',
    { type: "object", properties: { url: { type: "string", title: "URL", default: "https://google.com" } } },
    `const axios = require('axios');
const fs = require('fs');
const path = require('path');

exports.run = async (data) => {
  const qrUrl = \`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=\${encodeURIComponent(data.url)}\`;
  const tmpPath = path.join(process.cwd(), 'temp_qr.png');
  
  await utils.download(qrUrl, tmpPath);
  
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var p = doc.placedItems.add();
    p.file = File("\${tmpPath.replace(/\\\\/g, '/')}");
    p.position = [0, 0];
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-4', 'Swatch Sync', 'illustrator',
    'Adds a list of hex colors as Swatches.',
    { type: "object", properties: { colors: { type: "string", title: "Hex Codes (comma sep)", default: "#FF0000,#00FF00,#0000FF" } } },
    `exports.run = async (data) => {
  const hexes = data.colors.split(',');
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var hexes = "\${hexes.join(',')}".split(',');
    
    for(var i=0; i<hexes.length; i++) {
        var hex = hexes[i].replace('#','');
        var r = parseInt(hex.substring(0,2), 16);
        var g = parseInt(hex.substring(2,4), 16);
        var b = parseInt(hex.substring(4,6), 16);
        
        var col = new RGBColor();
        col.red = r; col.green = g; col.blue = b;
        
        var swatch = doc.swatches.add();
        swatch.color = col;
        swatch.name = "Imported_" + hex;
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-5', 'Logo Versioning', 'illustrator',
    'Converts selection to Grayscale and saves a copy.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    app.executeMenuCommand('Colors3'); // Convert to Grayscale command
    doc.saveAs(File(doc.fullName.toString().replace('.ai', '_BW.ai')));
    app.undo(); // Revert
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-6', 'Path Simplifier', 'illustrator',
    'Selects all path items and applies simplification.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    app.executeMenuCommand('selectall');
    app.executeMenuCommand('simplify'); // Opens dialog, or use specific logic
    // Note: Full control requires complex scripting or actions
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-7', 'Font Replacer', 'illustrator',
    'Replaces "Arial" with "Helvetica" globally.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    for(var i=0; i<doc.textFrames.length; i++) {
        var tf = doc.textFrames[i];
        // Basic check - iterating ranges is safer
        if(tf.textRange.characterAttributes.textFont.name.indexOf("Arial") > -1) {
            try {
                tf.textRange.characterAttributes.textFont = app.textFonts.getByName("Helvetica");
            } catch(e){}
        }
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-8', 'Dieline Generator', 'illustrator',
    'Draws a rectangle on a new "Dieline" layer matching artboard size.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect; // [left, top, right, bottom]
    
    var layer = doc.layers.add();
    layer.name = "Dieline";
    
    var path = layer.pathItems.rectangle(rect[1], rect[0], rect[2]-rect[0], rect[1]-rect[3]);
    path.filled = false;
    path.stroked = true;
    
    var spot = doc.spots.add();
    spot.name = "Dieline";
    spot.colorType = ColorModel.SPOT;
    var c = new CMYKColor(); c.cyan=0; c.magenta=100; c.yellow=0; c.black=0;
    spot.color = c;
    
    path.strokeColor = spot;
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-9', 'Asset Renamer', 'illustrator',
    'Renames selected items sequentially (Item 1, Item 2...).',
    { type: "object", properties: { prefix: { type: "string", default: "Asset" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var sel = app.activeDocument.selection;
    for(var i=0; i<sel.length; i++) {
        sel[i].name = "\${data.prefix} " + (i+1);
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ai-10', 'Pattern Generator', 'illustrator',
    'Randomly rotates and scales selected objects to create organic variety.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var sel = app.activeDocument.selection;
    for(var i=0; i<sel.length; i++) {
        var rot = Math.random() * 360;
        var scale = 50 + Math.random() * 100;
        sel[i].rotate(rot);
        sel[i].resize(scale, scale);
    }
  \`);
};`,
    `// Host Code`
  ),

  // --- INDESIGN EXAMPLES ---
  createExample(
    'id-1', 'PDF Export Preset', 'indesign',
    'Exports active doc using "High Quality Print" preset.',
    { type: "object", properties: { outPath: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var preset = app.pdfExportPresets.item("[High Quality Print]");
    var file = File("\${data.outPath.replace(/\\\\/g, '/')}/" + doc.name.replace('.indd', '.pdf'));
    doc.exportFile(ExportFormat.PDF_TYPE, file, false, preset);
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-2', 'Catalog Merger', 'indesign',
    'Simple placeholder for CSV merge logic.',
    { type: "object", properties: { csv: { type: "string", format: "file" } } },
    `exports.run = async (data) => {
  // Real data merge is complex, this is a stub
  await $.run_jsx(\`
    alert("Data Merge setup for " + "\${data.csv.replace(/\\\\/g, '/')}");
    // app.activeDocument.dataMergeProperties.selectDataSource(File(...));
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-3', 'Image Relinker', 'indesign',
    'Attempts to relink missing links from a specific folder.',
    { type: "object", properties: { folder: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    var folder = Folder("\${data.folder.replace(/\\\\/g, '/')}");
    var links = doc.links;
    for(var i=0; i<links.length; i++) {
        if(links[i].status == LinkStatus.LINK_MISSING) {
            var f = File(folder + "/" + links[i].name);
            if(f.exists) links[i].relink(f);
        }
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-4', 'Invoice Generator', 'indesign',
    'Updates Invoice # and Date fields.',
    {
      type: "object",
      properties: {
        num: { type: "string", title: "Invoice #", default: "INV-001" },
        date: { type: "string", title: "Date", default: "2024-01-01" }
      }
    },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    // Assumes text frames with script labels "inv_num" and "inv_date"
    var doc = app.activeDocument;
    try { doc.textFrames.item("inv_num").contents = "\${data.num}"; } catch(e){}
    try { doc.textFrames.item("inv_date").contents = "\${data.date}"; } catch(e){}
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-5', 'Preflight Check', 'indesign',
    'Checks for errors and alerts user.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var profile = app.preflightProfiles.item(0); // Basic
    var process = app.preflightProcesses.add(app.activeDocument, profile);
    process.waitForProcess();
    var results = process.processResults;
    alert(results);
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-6', 'Page Duplicator', 'indesign',
    'Duplicates the active page X times.',
    { type: "object", properties: { count: { type: "number", default: 1 } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var page = app.activeWindow.activePage;
    for(var i=0; i<\${data.count}; i++) {
        page.duplicate(LocationOptions.AFTER, page);
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-7', 'Text Frame Fitter', 'indesign',
    'Fits all text frames to content.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var frames = app.activeDocument.textFrames;
    for(var i=0; i<frames.length; i++) {
        frames[i].fit(FitOptions.FRAME_TO_CONTENT);
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-8', 'Business Deck Update', 'indesign',
    'Updates the footer text on the Master Spread.',
    { type: "object", properties: { footer: { type: "string", default: "Confidential 2024" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var master = app.activeDocument.masterSpreads.item(0);
    var frames = master.textFrames;
    // Simple approach: update ALL frames on master
    for(var i=0; i<frames.length; i++) {
        frames[i].contents = "\${data.footer}";
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-9', 'Booklet Imposition', 'indesign',
    'Moves pages to create a simple printer spread (Shuffle pages).',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var doc = app.activeDocument;
    doc.documentPreferences.allowPageShuffle = false;
    // Logic to move pages would go here
    alert("Page shuffle disabled. Ready for manual imposition.");
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'id-10', 'Export JPEG Proofs', 'indesign',
    'Exports all pages as 72dpi JPEGs.',
    { type: "object", properties: { outDir: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.MEDIUM;
    app.jpegExportPreferences.exportResolution = 72;
    app.activeDocument.exportFile(
        ExportFormat.JPG, 
        File("\${data.outDir.replace(/\\\\/g, '/')}/page.jpg")
    );
  \`);
};`,
    `// Host Code`
  ),

  // --- AFTER EFFECTS EXAMPLES ---
  createExample(
    'ae-1', 'CSV to Lower Thirds', 'aftereffects',
    'Duplicates a comp for each row in a CSV and updates text layers.',
    { type: "object", properties: { csv: { type: "string", format: "file" } } },
    `exports.run = async (data) => {
  // Node reads CSV...
  await $.run_jsx(\`
    var proj = app.project;
    var template = proj.item(1); // Assume item 1 is template comp
    // Loop logic would go here
    var newComp = template.duplicate();
    newComp.name = "Lower Third 1";
    newComp.layer(1).property("Source Text").setValue("New Name");
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ae-2', 'Batch Render', 'aftereffects',
    'Adds all open comps to Render Queue and starts rendering.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var proj = app.project;
    for(var i=1; i<=proj.numItems; i++) {
        if(proj.item(i) instanceof CompItem) {
            var rq = proj.renderQueue.items.add(proj.item(i));
            rq.outputModule(1).file = new File("~/Desktop/" + proj.item(i).name + ".mov");
        }
    }
    proj.renderQueue.render();
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'ae-3', 'Social Resizer', 'aftereffects',
    'Resizes active comp to 1080x1920 (9:16).',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var comp = app.project.activeItem;
    if(comp && comp instanceof CompItem) {
        comp.width = 1080;
        comp.height = 1920;
        // Logic to scale layers would go here
    }
  \`);
};`,
    `// Host Code`
  ),

  // --- PREMIERE PRO EXAMPLES ---
  createExample(
    'pr-1', 'Auto-Bin Structure', 'premiere',
    'Creates standard bin structure (Footage, Audio, Seqs).',
    { type: "object", properties: {} },
    `exports.run = async () => {
  await $.run_jsx(\`
    var proj = app.project;
    var root = proj.rootItem;
    root.createBin("01_Footage");
    root.createBin("02_Audio");
    root.createBin("03_Sequences");
    root.createBin("04_Exports");
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'pr-2', 'Export Active Sequence', 'premiere',
    'Exports the active sequence to a specific path.',
    { type: "object", properties: { outPath: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    var seq = app.project.activeSequence;
    if(seq) {
        var out = "\${data.outPath.replace(/\\\\/g, '/')}/" + seq.name + ".mp4";
        // Preset path required for export
        // seq.exportAsMediaDirect(out, "H.264 1080p", 0); 
        alert("Export triggered for " + seq.name);
    }
  \`);
};`,
    `// Host Code`
  ),
  createExample(
    'pr-3', 'Import Footage', 'premiere',
    'Imports all files from a selected folder.',
    { type: "object", properties: { folder: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  await $.run_jsx(\`
    app.project.importFiles(["\${data.folder.replace(/\\\\/g, '/')}/clip1.mp4"]); 
    // Note: PPro import requires array of paths
  \`);
};`,
    `// Host Code`
  ),

  // --- LIGHTROOM EXAMPLES ---
  createExample(
    'lr-1', 'Auto-Import Watcher', 'lightroom',
    'Simulates watching a folder and importing photos.',
    { type: "object", properties: { folder: { type: "string", format: "folder" } } },
    `exports.run = async (data) => {
  // Lightroom Classic uses Lua, not ExtendScript.
  // This would typically trigger a shell command or use a plugin bridge.
  console.log("Lightroom automation requires Lua plugin bridge.");
  utils.setUI('status', 'Triggered Lightroom Import (Simulated)');
};`,
    `-- Lua Code would go here`
  ),
  createExample(
    'lr-2', 'Export to Instagram', 'lightroom',
    'Exports selected photos with 4:5 crop settings.',
    { type: "object", properties: {} },
    `exports.run = async () => {
  console.log("Exporting for Instagram...");
};`,
    `-- Lua Code`
  ),
];

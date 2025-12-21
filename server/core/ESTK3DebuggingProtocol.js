
"use strict";
const fastXMLParser = require("fast-xml-parser");
const ESDCore = require("./ESDCore");

const XML_OPTIONS = {
    attributeNamePrefix: "@",
    ignoreAttributes: false,
    parseAttributeValue: true,
    textNodeName: "#value",
};

function WrapWithCDATA(content) {
    return `<![CDATA[${content.replace(/]]>/g, "]]
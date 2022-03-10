
import { getFontSize, calcWordWidth, calcWordMetrics } from "./textUtils.js"
import { updateHOCRBoundingBoxWord, updateHOCRWord } from "./interfaceEdit.js";

export async function renderPage(canvas, doc, xmlDoc, mode = "screen", defaultFont, lineMode = false, imgDims, canvasDims, angle, pdfMode, fontObj, leftAdjX){

  let ctx = canvas.getContext('2d');
  let imgWidth = imgDims[1];
  let imgHeight = imgDims[0];

  let canvasWidth = canvasDims[1];
  let canvasHeight = canvasDims[0];

  let max_width = document.getElementById('zoomInput').value;


  let lines = xmlDoc.getElementsByClassName("ocr_line");

    let fontSize;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        let titleStrLine = line.getAttribute('title');

        let linebox = [...titleStrLine.matchAll(/bbox(?:es)?(\s+\d+)(\s+\d+)?(\s+\d+)?(\s+\d+)?/g)][0].slice(1,5).map(function (x) {return parseInt(x);});
        let baseline = titleStrLine.match(/baseline(\s+[\d\.\-]+)(\s+[\d\.\-]+)/);
        if(baseline != null){
          baseline = baseline.slice(1,5).map(function (x) {return parseFloat(x);});
        } else {
          baseline = [0,0];
        }
        let words = line.getElementsByClassName("ocrx_word");



        // If possible (native Tesseract HOCR) get font size using x-height.
        // If not possible (Abbyy XML) get font size using ascender height.
         let letterHeight = titleStrLine.match(/(?<=x_size\s+)[\d\.\-]+/);
         let ascHeight = titleStrLine.match(/(?<=x_ascenders\s+)[\d\.\-]+/);
         let descHeight = titleStrLine.match(/(?<=x_descenders\s+)[\d\.\-]+/);
         if(letterHeight != null && ascHeight != null && descHeight != null){
            letterHeight = parseFloat(letterHeight[0]);
            ascHeight =  parseFloat(ascHeight[0]);
            descHeight = parseFloat(descHeight[0]);
            let xHeight = letterHeight - ascHeight - descHeight;
            fontSize = getFontSize(defaultFont, xHeight, "o", ctx);
         } else if(letterHeight != null){
           letterHeight = parseFloat(letterHeight[0]);
           descHeight = descHeight != null ? parseFloat(descHeight[0]) : 0;
           fontSize = getFontSize(defaultFont, letterHeight - descHeight, "A", ctx);
         }
         // If none of the above conditions are met (not enough info to calculate font size), the font size from the previous line is reused.

         ctx.font = 1000 + 'px ' + defaultFont;
         const AMetrics = ctx.measureText("A");
         const oMetrics = ctx.measureText("o");
         const jMetrics = ctx.measureText("gjpqy");
         ctx.font = fontSize + 'px ' + defaultFont;


          let angleAdjX = 0;
          let angleAdjY = 0;
          if(autoRotateCheckbox.checked && Math.abs(angle ?? 0) > 0.05){
            angleAdjX = Math.sin(angle * (Math.PI / 180)) * (linebox[3] + baseline[1]);
            angleAdjY = Math.sin(angle * (Math.PI / 180)) * (linebox[0] + angleAdjX /2) * -1;
          }

        for (let j = 0; j < words.length; j++) {
          let word = words[j];

          let titleStr = word.getAttribute('title') ?? "";
          let styleStr = word.getAttribute('style') ?? "";

          if (word.childNodes[0].textContent.trim() == "") continue;

          let box = [...titleStr.matchAll(/bbox(?:es)?(\s+\d+)(\s+\d+)?(\s+\d+)?(\s+\d+)?/g)][0].slice(1,5).map(function (x) {return parseInt(x);})
          let box_width = box[2] - box[0];
          let box_height = box[3] - box[1];

          let wordText, wordSup, wordDropCap;
          if(/\<sup\>/i.test(word.innerHTML)){
            wordText = word.innerHTML.replace(/^\s*\<sup\>/i, "");
            wordText = wordText.replace(/\<\/sup\>\s*$/i, "");
            wordSup = true;
            wordDropCap = false;
          } else if(/\<span class\=[\'\"]ocr_dropcap[\'\"]\>/i.test(word.innerHTML)){
            wordText = word.innerHTML.replace(/^\s*<span class\=[\'\"]ocr_dropcap[\'\"]\>/i, "");
            wordText = wordText.replace(/\<\/span\>\s*$/i, "");
            wordSup = false;
            wordDropCap = true;
          } else {
            wordText = word.childNodes[0].nodeValue;
            wordSup = false;
            wordDropCap = false;
          }

          let wordFontSize;
          let fontSizeStr = styleStr.match(/(?<=font\-size\:\s*)\d+/i);
          if(fontSizeStr != null){
            wordFontSize = parseFloat(fontSizeStr[0]);
          } else if(wordSup){
            // All superscripts are assumed to be numbers for now
            wordFontSize = getFontSize(defaultFont, box_height, "1", ctx);
          } else if(wordDropCap){
            wordFontSize = getFontSize(defaultFont, box_height, wordText.slice(0,1), ctx);
          } else {
            wordFontSize = fontSize;
          }

          let fontStyle;
          if(/italic/i.test(styleStr)){
            fontStyle = "italic";
          } else if(/small\-caps/i.test(styleStr)){
            fontStyle = "small-caps";
          } else {
            fontStyle = "normal";
          }


          let fontFamilyWord = styleStr.match(/(?<=font\-family\s{0,3}\:\s{0,3}[\'\"]?)[^\'\";]+/);
          let defaultFontFamily;
          if(fontFamilyWord == null){
            fontFamilyWord = defaultFont
            defaultFontFamily = true;
          } else {
            fontFamilyWord = fontFamilyWord[0].trim();
            defaultFontFamily = false;
          }


          let x_wconf;
          let confMatch = titleStr.match(/(?<=(?:;|\s)x_wconf\s+)\d+/);
          let wordConf = 0;
          if(confMatch != null){
            wordConf = parseInt(confMatch[0]);
          }

          let word_id = word.getAttribute('id');


          const confThreshHigh = document.getElementById("confThreshHigh").value != "" ? parseInt(document.getElementById("confThreshHigh").value) : 85;
          const confThreshMed = document.getElementById("confThreshMed").value != "" ? parseInt(document.getElementById("confThreshMed").value) : 75;

          let fillColorHex;
          if(wordConf > confThreshHigh){
            // fillColorRGB = "rgb(0,255,125)"
            fillColorHex = "#00ff7b";
          } else if(wordConf > confThreshMed){
            // fillColorRGB = "rgb(255,200,0)"
            fillColorHex = "#ffc800";
          } else {
            // fillColorRGB = "rgb(255,0,0)"
            fillColorHex = "#ff0000";
          }

          let  missingKerning, kerning;
          //let kerning;
          let kerningMatch = styleStr.match(/(?<=letter-spacing\:)([\d\.\-]+)/);
          if(kerningMatch == null){
            kerning = 0;
            missingKerning = true;
          } else {
            kerning = parseFloat(kerningMatch[0]);
            missingKerning = false;
          }

          let opacity_arg, fill_arg;
          // Set current text color and opacity based on display mode selected
          if(document.getElementById('displayMode').value == "invis"){
          opacity_arg = 0
          fill_arg = "black"
        } else if(document.getElementById('displayMode').value == "ebook") {
          opacity_arg = 1
          fill_arg = "black"
        } else {
          opacity_arg = 1
          fill_arg = fillColorHex
        }

        if(fontStyle == "small-caps"){
          ctx.font = wordFontSize + 'px ' + fontFamilyWord + " Small Caps";
        } else {
          ctx.font = fontStyle + " " + wordFontSize + 'px ' + fontFamilyWord;
        }



        // Calculate font glyph metrics for precise positioning
        let wordLastGlyphMetrics = fontObj[fontFamilyWord][fontStyle].charToGlyph(wordText.substr(-1)).getMetrics();
        let wordFirstGlyphMetrics = fontObj[fontFamilyWord][fontStyle].charToGlyph(wordText.substr(0,1)).getMetrics();

        let wordLeftBearing = wordFirstGlyphMetrics.xMin * (fontSize / fontObj[fontFamilyWord][fontStyle].unitsPerEm);
        let wordRightBearing = wordLastGlyphMetrics.rightSideBearing * (fontSize / fontObj[fontFamilyWord][fontStyle].unitsPerEm);


        let wordWidth1 = ctx.measureText(wordText).width;
        let wordWidth = wordWidth1 - wordRightBearing - wordLeftBearing + (wordText.length - 1) * kerning;


        //wordWidth = textbox.width
        // If kerning is off, change the kerning value for both the canvas textbox and HOCR
        if(wordText.length > 1 && Math.abs(box_width - wordWidth) > 1){
          kerning = kerning + (box_width - wordWidth) / (wordText.length - 1);
          if(missingKerning){
            if(styleStr.length > 0){
              styleStr = styleStr + ";";
            }
            styleStr = styleStr + "letter-spacing:" + kerning + "px";
          } else {
            styleStr = styleStr.replace(/(?<=letter-spacing\:)([\d\.\-]+)/, kerning);
          }
          word.setAttribute("style", styleStr);
        }



          // Add to PDF document (if that option is selected)
          if(mode == "pdf"){

            // TODO: Investigate this block of code.
            // Specifically, the "fontPDFStr != doc._font.name" condition is virtually alawys true due to differences in formatting, and
            // small caps are not being inserted properly.
            // This is particularly problematic when a PDF export starts with small caps (then the entire document goes crazy).
            const fontPDFStr = fontFamilyWord + "-" + fontStyle;
            //console.log("Comp: " + fontPDFStr + " " + doc._font.name);
            // if(fontPDFStr != doc._font.name){
            //   doc.font(defaultFont + "-" + fontStyle);
            // }

            window.doc.font(defaultFont + "-" + fontStyle);

            //doc.font("Libre Baskerville-small-caps")

            // TODO: Rotation is currently not applied to the background of the PDF, so a different left/top argument
            // is used temporarily for any mode with a backgound image included.
            //let left,top;
            // if(document.getElementById('displayMode').value == "ebook"){
            //   left = box[0] - wordLeftBearing + angleAdjX + leftAdjX;
            //   top = linebox[3] + baseline[1] + angleAdjY;
            // } else {
            //   left = box[0] - wordLeftBearing + leftAdjX;
            //   top = linebox[3] + baseline[1];
            // }

            let top;
            if(wordSup || wordDropCap){

              let angleAdjYSup = Math.sin(angle * (Math.PI / 180)) * (box[0] - linebox[0]) * -1;

              if(wordSup){
                top = linebox[3] + baseline[1] + angleAdjY + (box[3] - (linebox[3] + baseline[1])) + angleAdjYSup;
              } else {
                top = box[3] + angleAdjY + angleAdjYSup;
              }
            } else {
               top = linebox[3] + baseline[1] + angleAdjY;
            }
            let left = box[0] - wordLeftBearing + angleAdjX + leftAdjX;


            // Characters that go off the edge will cause an additional case to be made.
            // To avoid this, such characters are skipped.
            if(top <= 0 || top + wordFontSize >= canvasHeight || left <= 0 || left + wordWidth1 >= canvasWidth){
              console.log("Skipping word: " + wordText);
              continue;
              console.log("Failed to skip: " + wordText);
            }

            if(top <= 0 || top + wordFontSize >= canvasHeight || left <= 0 || left + wordWidth1 >= canvasWidth){
              console.log("Failed to skip: " + wordText);
            }


            window.doc.fontSize(wordFontSize);
            window.doc.fillColor(fill_arg).fillOpacity(opacity_arg);

            // TODO: Implement mode for exporting with other fonts (where spacing looks natural, as opposed to trying to perfectly align letters with image).
            lineMode = false;
            if(lineMode){

              if(j == 0){
                window.doc.text(
                wordText,
                left,
                top,
                {baseline: "alphabetic",
                continued: true,
                align: 'left',
                //width: linebox[2] - linebox[0],
                lineBreak: false})
              } else if(j + 1 == words.length){
                window.doc.text(
                " " + wordText,
                {baseline: "alphabetic",
              lineBreak: false})
            } else {
              window.doc.text(
              " " + wordText,
              {baseline: "alphabetic",
              continued: true,
            lineBreak: false})

            }

            } else {
              window.doc.text(
              wordText,
              left,
              top,
              {baseline: "alphabetic",
              characterSpacing: kerning })
              if(wordText == "reflection"){
                console.log("Word: " + wordText + " Kerning: " + kerning + " (Font size: " + wordFontSize + ", " + defaultFont + "-" + fontStyle + ")");
              }

            }


          // Otherwise, render to the canvas
          } else {


            // The function fontBoundingBoxDescent currently is not enabled by default in Firefox.
            // Can return to this simpler code if that changes.
            // https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics/fontBoundingBoxDescent
            //let fontDesc = (jMetrics.fontBoundingBoxDescent - oMetrics.actualBoundingBoxDescent) * (fontSize / 1000);

            let fontBoundingBoxDescent = Math.round(Math.abs(fontObj[defaultFont]["normal"].descender) * (1000 / fontObj[defaultFont]["normal"].unitsPerEm));

            let fontDesc = (fontBoundingBoxDescent - oMetrics.actualBoundingBoxDescent) * (fontSize / 1000);

            let left = box[0] - wordLeftBearing + angleAdjX + leftAdjX;
            let top;
            if(wordSup || wordDropCap){

              let angleAdjYSup = Math.sin(angle * (Math.PI / 180)) * (box[0] - linebox[0]) * -1;

              if(wordSup){
                top = linebox[3] + baseline[1] + fontDesc + angleAdjY + (box[3] - (linebox[3] + baseline[1])) + angleAdjYSup;
              } else {
                fontDesc = (fontBoundingBoxDescent - oMetrics.actualBoundingBoxDescent) * (wordFontSize / 1000);
                top = box[3] + fontDesc + angleAdjY + angleAdjYSup;
              }


              //top = linebox[3] + baseline[1] + fontDesc + angleAdjY;
            } else {
              top = linebox[3] + baseline[1] + fontDesc + angleAdjY;
            }

            let fontFamilyWordCanvas = fontStyle == "small-caps" ? fontFamilyWord + " Small Caps" : fontFamilyWord;
            let fontStyleCanvas = fontStyle == "small-caps" ? "normal" : fontStyle;




            let textbox = new fabric.IText(wordText, { left: left,
            //top: y,
            top: top,
            leftOrig:left,
            topOrig:top,
            baselineAdj:0,
            wordSup:wordSup,
            originY: "bottom",
            fill: fill_arg,
            fill_proof: fillColorHex,
            fill_ebook: 'black',
            fontFamily: fontFamilyWordCanvas,
            fontStyle: fontStyleCanvas,
            wordID: word_id,
            line: i,
            boxWidth: box_width,
            defaultFontFamily: defaultFontFamily,
            //fontFamily: 'times',
            opacity: opacity_arg,
            charSpacing: kerning * 1000 / wordFontSize,
            fontSize: wordFontSize,
            showTextBoxBorder: document.getElementById("showBoundingBoxes").checked});

            let renderWordBoxes = false;
            if(renderWordBoxes){
              let rect = new fabric.Rect({ left: left,
                top: top,
                originY: "bottom",
                width: box_width,
                height: box_height,
                stroke: '#287bb5',
                fill: false,
                opacity: 0.7 });
              rect.hasControls = false;
              rect.hoverCursor = false;
              canvas.add(rect);
            }


            textbox.on('editing:exited', function() {
              console.log("Event: editing:exited");
              if(this.hasStateChanged){
                if(document.getElementById("smartQuotes").checked && /[\'\"]/.test(this.text)){
                  let textInt = this.text;
                  textInt = textInt.replace(/(?<=^|[-–—])\'/, "‘");
                  textInt = textInt.replace(/(?<=^|[-–—])\"/, "“");
                  textInt = textInt.replace(/\'(?=$|[-–—])/, "’");
                  textInt = textInt.replace(/\"(?=$|[-–—])/, "”");
                  textInt = textInt.replace(/(?<=[a-z])\'(?=[a-z]$)/i, "’");
                  this.text = textInt;
                }

                const wordWidth = calcWordWidth(this.text, this.fontFamily, this.fontSize, this.fontStyle);
                if(this.text.length > 1){
                  const kerning = (this.boxWidth - wordWidth) / (this.text.length - 1);
                  this.charSpacing = kerning * 1000 / this.fontSize;
                }
                updateHOCRWord(this.wordID, this.text)
              }
            });
            textbox.on('selected', function() {
              console.log("Event: selected");
              if(!this.defaultFontFamily && Object.keys(fontObj).includes(this.fontFamily)){
                document.getElementById("wordFont").value = this.fontFamily;
              }
              document.getElementById("fontSize").value = this.fontSize;

            });
            textbox.on('deselected', function() {
              console.log("Event: deselected");
              document.getElementById("wordFont").value = "Default";
              //document.getElementById("collapseRange").setAttribute("class", "collapse");
              bsCollapse.hide();
              document.getElementById("rangeBaseline").value = 100;
            });
            textbox.on('modified', (opt) => {
            // inspect action and check if the value is what you are looking for
            console.log("Event: " + opt.action);
              if(opt.action == "scaleX"){
                const textboxWidth = opt.target.calcTextWidth()
                const wordMetrics = calcWordMetrics(opt.target.text, opt.target.fontFamily, opt.target.fontSize, opt.target.fontStyle);
                const widthCalc = (textboxWidth - wordMetrics[1]) * opt.target.scaleX;

                let rightNow = opt.target.left + widthCalc;
                let rightOrig = opt.target.leftOrig + opt.target.boxWidth;

                updateHOCRBoundingBoxWord(opt.target.wordID, Math.round(opt.target.left - opt.target.leftOrig),Math.round(rightNow - rightOrig));
                if(opt.target.text.length > 1){


                  const widthDelta = widthCalc - opt.target.boxWidth;
                  if(widthDelta != 0){
                    const charSpacingDelta = (widthDelta / (opt.target.text.length - 1)) * 1000 / opt.target.fontSize;
                    opt.target.charSpacing = (opt.target.charSpacing ?? 0) + charSpacingDelta;
                    opt.target.scaleX = 1;

                  }

                }

                opt.target.leftOrig = opt.target.left;
                opt.target.boxWidth = Math.round(rightNow - opt.target.left - wordMetrics[1]);

              }
            });


            // TODO: A prototype for the texboxes should be created instead of adding to each one

            canvas.add(textbox);

          }
    }
  }

}
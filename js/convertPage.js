

onmessage = function(e) {
  let workerResult;
  if(e.data[2]){
    workerResult = [convertPageAbbyy(e.data[0], e.data[1]),e.data[1]];
  } else {
    workerResult = [convertPage(e.data[0]),e.data[1]];
  }
  postMessage(workerResult);
}


function quantile(arr, ntile){
  if(arr.length == 0){
    return null
  }
  const mid = Math.floor(arr.length * ntile)
  arr.sort((a, b) => a - b);

  return arr[mid];
};

const mean50 = arr => {
  if(arr.length == 0){
    return null;
  }
  const per25 = Math.floor(arr.length / 4) - 1;
  const per75 = Math.ceil(arr.length * 3 / 4) - 1;
  const nums = [...arr].sort((a, b) => a - b);
  const numsMiddle = nums.slice(per25, per75+1);

  return numsMiddle.reduce((a, b) => a + b) / numsMiddle.length;
;
};


function convertPage(hocrString){

  let widthObjPage = new Object;
  let heightObjPage = new Object;
  let heightSmallCapsObjPage = new Object;
  let cutObjPage = new Object;
  let kerningObjPage = new Object;

  var angleRisePage = new Array;
  var lineLeft = new Array;
  var lineTop = new Array;

  let pageDims = [null,null];
  let pageElement = hocrString.match(/<div class=[\"\']ocr_page[\"\'][^\>]+/i);
  if(pageElement != null){
    pageElement = pageElement[0];
    pageDims = pageElement.match(/(?<=bbox \d+ \d+ )(\d+) (\d+)/i);
    pageDims = [parseInt(pageDims[2]),parseInt(pageDims[1])];
  }

  // Test whether character-level data (class="ocrx_cinfo" in Tesseract) is present.
  const charMode = /ocrx_cinfo/.test(hocrString) ? true : false;

  // Test whether cuts are present.
  // This will be the case for users re-importing HOCR generated by the site.
  //const cutsMode = /\<span[^\>]*cuts/i.test(hocrString) ? true : false;

  // The JavaScript regex engine does not support matching start/end tags (some other engines do), so the end of words and lines are detected
  // through a hard-coded number of </span> end tags.  The only difference charMode should make on the expressions below is the number of
  // consecutive </span> tags required.
  let lineRegex;
  if(charMode){
    lineRegex = new RegExp(/<span class\=[\"\']ocr_line[\s\S]+?(?:\<\/span\>\s*){3}/, "ig");
  } else {
    lineRegex = new RegExp(/<span class\=[\"\']ocr_line[\s\S]+?(?:\<\/span\>\s*){2}/, "ig");
  }


  const wordRegex = new RegExp(/<span class\=[\"\']ocrx_word[\s\S]+?(?:\<\/span\>\s*){2}/, "ig");
  const charRegex = new RegExp(/<span class\=[\"\']ocrx_cinfo[\"\'] title=\'([^\'\"]+)[\"\']\>([^\<]*)\<\/span\>/, "ig");
  const charBboxRegex = new RegExp(/bbox(?:es)?(\s+\d+)(\s+\d+)?(\s+\d+)?(\s+\d+)?/, "g");
  const wordElementRegex = new RegExp(/<span class\=[\"\']ocrx_word[^\>]+\>/, "i");
  const wordTitleRegex = new RegExp(/(?<=title\=[\"\'])[^\"\']+/);

  // Remove all bold/italics tags.  These complicate the syntax and are unfortunately virtually always wrong anyway (coming from Tesseract).
  hocrString = hocrString.replaceAll(/<\/?strong>/ig, "");
  hocrString = hocrString.replaceAll(/<\/?em>/ig, "");

  // Delete namespace to simplify xpath
  hocrString = hocrString.replace(/<html[^>]*>/i, "<html>");

  // Replace various classes with "ocr_line" class for simplicity
  // At least in Tesseract, these elements are not identified accurately or consistently enough to warrent different treatment.
  hocrString = hocrString.replace(/(?<=class=\')ocr_caption/ig, "ocr_line");
  hocrString = hocrString.replace(/(?<=class=\')ocr_textfloat/ig, "ocr_line");
  hocrString = hocrString.replace(/(?<=class=\')ocr_header/ig, "ocr_line");

  function convertLine(match){
    let titleStrLine = match.match(/(?<=title\=[\'\"])[^\'\"]+/)
    if(titleStrLine == null){
      return("");
    } else {
      titleStrLine = titleStrLine[0];
    }
    let linebox = [...titleStrLine.matchAll(/bbox(?:es)?(\s+\d+)(\s+\d+)?(\s+\d+)?(\s+\d+)?/g)][0].slice(1,5).map(function (x) {return parseInt(x)})

    // The baseline can be missing in the case of vertical text (textangle present instead)
    let baseline = [...titleStrLine.matchAll(/baseline(\s+[\d\.\-]+)(\s+[\d\.\-]+)/g)][0];
    if(baseline == null){
      return("");
    } else {
      baseline = baseline.slice(1,5).map(function (x) {return parseFloat(x)});
    }
    // Only calculate baselines from lines 200px+.
    // This avoids short "lines" (e.g. page numbers) that often report wild values.
    if((linebox[2] - linebox[0]) >= 200){
      angleRisePage.push(baseline[0]);
      lineLeft.push(linebox[0]);
      lineTop.push(linebox[1]);
    }

    let letterHeight = parseFloat(titleStrLine.match(/(?<=x_size\s+)[\d\.\-]+/)[0]);
    let ascHeight = parseFloat(titleStrLine.match(/(?<=x_ascenders\s+)[\d\.\-]+/)[0]);
    let descHeight = parseFloat(titleStrLine.match(/(?<=x_descenders\s+)[\d\.\-]+/)[0]);
    let xHeight = letterHeight - ascHeight - descHeight;

    function convertWord(match){
       let text = "";
       //let it = match.matchAll(/<span class\=[\"\']ocrx_cinfo[\"\'] title=\'([^\'\"]+)[\"\']\>([^\<]*)\<\/span\>/ig);
       let it = match.matchAll(charRegex);
       let letterArr = [...it];
       let bboxes = Array(letterArr.length);
       let cuts = Array(letterArr.length);

       // Unlike Abbyy, which generally identifies small caps as lowercase letters (and identifies small cap text explicitly as a formatting property),
       // Tesseract (at least the Legacy model) reports them as upper-case letters.
       let wordStr = letterArr.map(x => x[2]).join("");
       let smallCaps = false;
       if(!/[a-z]/.test(wordStr) && /[A-Z].?[A-Z]/.test(wordStr)){
         let wordBboxesTop = letterArr.map(x => x[1].match(/(?<=\d+ )\d+/)[0]);
         let wordBboxesBottom = letterArr.map(x => x[1].match(/(?<=\d+ \d+ \d+ )\d+/)[0]);
         if(Math.min(...letterArr.map(x => x[1].match(/(?<=\d+ )\d+/)[0]).map(x => Math.sign((x - wordBboxesBottom[0]) + ((wordBboxesBottom[0] - wordBboxesTop[0]) * 0.8))).slice(1)) == 1){
           smallCaps = true;
         }
       }


       for (let j = 0; j < letterArr.length; j++) {
        let titleStrLetter = letterArr[j][1];
        let contentStrLetter = letterArr[j][2];
        //bboxes[j] = [...titleStrLetter.matchAll(/bbox(?:es)?(\s+\d+)(\s+\d+)?(\s+\d+)?(\s+\d+)?/g)][0].slice(1,5).map(function (x) {return parseInt(x)});
        bboxes[j] = [...titleStrLetter.matchAll(charBboxRegex)][0].slice(1,5).map(function (x) {return parseInt(x)});

        // Multiple characters within a single <ocrx_cinfo> tag have been observed from Tesseract (even when set to char-level output).
        // May cause future issues as this code assumes one character per <ocrx_cinfo> tag.
        const charUnicode = String(contentStrLetter.charCodeAt(0));

        const charWidth = bboxes[j][2] - bboxes[j][0];
        const charHeight = bboxes[j][3] - bboxes[j][1];

        if(smallCaps){
          if(j > 0){
            if(heightSmallCapsObjPage[charUnicode] == null){
              heightSmallCapsObjPage[charUnicode] = new Array();
            }
            heightSmallCapsObjPage[charUnicode].push(charHeight / xHeight);
          }

        } else {
          if(widthObjPage[charUnicode] == null){
            widthObjPage[charUnicode] = new Array();
            heightObjPage[charUnicode] = new Array();
          }

          // Skip letters likely misidentified due to hallucination effect (where e.g. "v" is misidentified as "V") or small caps
          if(!(/[A-Z]/.test(contentStrLetter) && (charHeight / xHeight) < 1.2)){
          //if(!(["V","O"].includes(charUnicode) && (charHeight / xHeight) < 1.2)){

            widthObjPage[charUnicode].push(charWidth / xHeight);
            heightObjPage[charUnicode].push(charHeight / xHeight);
          }

          if(j == 0){
            cuts[j] = 0;
          } else {
            cuts[j] = bboxes[j][0] - bboxes[j-1][2];

            var bigramUnicode = letterArr[j-1][2].charCodeAt(0) + "," + letterArr[j][2].charCodeAt(0);
            var cuts_ex = cuts[j] / xHeight;

            if(cutObjPage[charUnicode] == null){
              cutObjPage[charUnicode] = new Array();
            }
            cutObjPage[charUnicode].push(cuts_ex);

            if(kerningObjPage[bigramUnicode] == null){
              kerningObjPage[bigramUnicode] = new Array();
            }
            kerningObjPage[bigramUnicode].push(cuts_ex);
          }
        }

        text = text + contentStrLetter;
      }
      text = text ?? "";
      text = text.trim()

      if(text == ""){
        return("");
      } else {
        //let wordStr = match.match(/<span class\=[\"\']ocrx_word[^\>]+\>/i)[0];
        let wordStr = match.match(wordElementRegex)[0];
        //wordStr = wordStr.replace(/(?<=title\=[\"\'])[^\"\']+/, "$&" + ";cuts " + cuts.join(' '));
        //wordStr = wordStr.replace(wordTitleRegex, "$&" + ";cuts " + cuts.join(' '));
        return(wordStr + text + "</span>");
      }
    }

    // Reads "cuts" and inserts values into objects.
    // Unlike "convertWord" this function is called entirely for its side effects and does not edit the HOCR.
    // function parseCuts(match){
    //   let titleStrLine = match.match(wordTitleRegex);
    //   if(titleStrLine == null){
    //     return(match)
    //   } else {
    //     titleStrLine = titleStrLine[0];
    //   }
    //
    //   let contentStr = match.match(/(?<=\>)[^\<]*/)[0];
    //   let contentArr = [...contentStr.match(/./g)];
    //
    //   let cutsStr = titleStrLine.match(/cuts[^\;]+/i)[0];
    //   let cutsArr = [...cutsStr.match(/[\-\d]+/g)];
    //
    //   if(contentArr.length != cutsArr.length){
    //     return(match);
    //   }
    // }

    if(charMode){
      match = match.replaceAll(wordRegex, convertWord);
    }

    return(match);
  }


  hocrString = hocrString.replaceAll(lineRegex, convertLine);


  let angleRiseMedian = mean50(angleRisePage);


  let lineLeftAdj = new Array;
  for(let i = 0; i < lineLeft.length; i++){
    lineLeftAdj.push(lineLeft[i] + angleRiseMedian * lineTop[i]);
  }

  const angleOut = Math.asin(angleRiseMedian) * (180/Math.PI);

  let leftOut = quantile(lineLeft, 0.2);
  let leftAdjOut = quantile(lineLeftAdj, 0.2) - leftOut;
  // With <5 lines either a left margin does not exist (e.g. a photo or title page) or cannot be reliably determined
  if(lineLeft.length < 5){
    leftOut = null;
  }

  const xmlOut = hocrString;
  const dimsOut = pageDims;

  const widthOut = widthObjPage;
  const heightOut = heightObjPage;
  const heightSmallCapsOut = heightSmallCapsObjPage;
  const cutOut = cutObjPage;
  const kerningOut = kerningObjPage;

  const message_out = charMode ? "" : "char_warning";

  return([xmlOut,dimsOut,angleOut,leftOut,leftAdjOut,widthOut,heightOut,heightSmallCapsOut,cutOut,kerningOut,message_out]);

}


const abbyyDropCapRegex = new RegExp(/\<par dropCapCharsCount\=[\'\"](\d*)/, "i");
const abbyyLineBoxRegex = new RegExp(/\<line baseline\=[\'\"](\d*)[\'\"] l\=[\'\"](\d*)[\'\"] t\=[\'\"](\d*)[\'\"] r\=[\'\"](\d*)[\'\"] b\=[\'\"](\d*)[\'\"]\>/, "i");
const abbyySplitRegex = new RegExp(/(?:\<charParams[^\>]*\>\s*\<\/charParams\>)|(?:\<\/formatting\>\s*(?=\<formatting))/, "ig");

const abbyyCharRegex = new RegExp(/(\<formatting[^\>]+\>\s*)?\<charParams l\=[\'\"](\d*)[\'\"] t\=[\'\"](\d*)[\'\"] r\=[\'\"](\d*)[\'\"] b\=[\'\"](\d*)[\'\"](?: suspicious\=[\'\"](\w*)[\'\"])?[^\>]*\>([^\<]*)\<\/charParams\>/, "ig");

function convertPageAbbyy(xmlPage, pageNum){
  // Return early if character-level data is not detected.
  // Unlike Tesseract HOCR (which by default returns word-level data which we can still use), Abbyy XML returns line-level data that is not usable.
  let pageDims = xmlPage.match(/<page width=[\'\"](\d+)[\'\"] height=[\'\"](\d+)[\'\"]/);
  pageDims = [parseInt(pageDims[2]),parseInt(pageDims[1])];

  if(!/\<charParams/i.test(xmlPage)){
    return(["",pageDims,null,null,null,new Object,new Object,new Object,new Object,new Object,"char_error"])
  }

  let widthObjPage = new Object;
  let heightObjPage = new Object;
  let cutObjPage = new Object;
  let kerningObjPage = new Object;

  let lineLeft = new Array;
  let lineTop = new Array;

  // Includes all capital letters except for "J" and "Q"
  const ascCharArr = ["A","B","C","D","E","F","G","H","I","K","L","M","N","O","P","R","S","T","U","V","W","X","Y","Z","b","d","h","k","l","t","0","1","2","3","4","5","6","7","8","9"];
  const xCharArr = ["a","c","e","m","n","o","r","s","u","v","w","x","z"]

  function convertLineAbbyy(xmlLine, lineNum, pageNum = 1){
    let widthPxObjLine = new Object;
    let heightPxObjLine = new Object;
    let cutPxObjLine = new Object;
    let kerningPxObjLine = new Object;

    // Unlike Tesseract HOCR, Abbyy XML does not provide accurate metrics for determining font size, so they are calculated here.
    // Strangely, while Abbyy XML does provide a "baseline" attribute, it is often wildly incorrect (sometimes falling outside of the bounding box entirely).
    // One guess as to why is that coordinates calculated pre-dewarping are used along with a baseline calculated post-dewarping.
    // Regardless of the reason, baseline is recalculated here.
    let lineAscHeightArr = new Array();
    let lineXHeightArr = new Array();
    let lineAllHeightArr = new Array();
    let baselineHeightArr = new Array();
    let baselineSlopeArr = new Array();
    let baselineFirst = new Array();

    let dropCap = false;
    let dropCapMatch = xmlLine.match(abbyyDropCapRegex);
    if(dropCapMatch != null && parseInt(dropCapMatch[1]) > 0){
      dropCap = true;
    }

    let lineBoxArr = xmlLine.match(abbyyLineBoxRegex);
    if(lineBoxArr == null) {return("")};
    lineBoxArr = [...lineBoxArr].map(function (x) {return parseInt(x)});
    // Only calculate baselines from lines 200px+.
    // This avoids short "lines" (e.g. page numbers) that often report wild values.
    if((lineBoxArr[4] - lineBoxArr[2]) >= 200){
      //angleRisePage.push(baseline[0]);
      lineLeft.push(lineBoxArr[2]);
      lineTop.push(lineBoxArr[3]);
    }


    // Unlike Tesseract, Abbyy XML does not have a native "word" unit (it provides only lines and letters).
    // Therefore, lines are split into words on either (1) a space character or (2) a change in formatting.
    //
    // These regex remove blank characters that happen next to changes in formatting to avoid making too many words.
    // Note: Abbyy is inconsistent regarding where formatting elements are placed.
    // Sometimes the <format> comes after the space between words, and sometimes it comes before the space between words.
    xmlLine = xmlLine.replaceAll(/(\<\/formatting\>\<formatting[^\>]*\>\s*)<charParams[^\>]*\>\s*\<\/charParams\>/ig, "$1")
    xmlLine = xmlLine.replaceAll(/\<charParams[^\>]*\>\s*\<\/charParams\>(\s*\<\/formatting\>\<formatting[^\>]*\>\s*)/ig, "$1")
    //xmlLine = xmlLine.replaceAll(/\<formatting[^\>]*\>\s*\<\/formatting\>/ig, "")
    //xmlLine = xmlLine.replaceAll(/\<\/formatting\>\s*$/ig, "")
    //xmlLine = xmlLine.replaceAll(/\<charParams[^\>]*\>\s*\<\/charParams\>\s*$/ig, "")

    let wordStrArr = xmlLine.split(abbyySplitRegex);

    // Filter off any array elements that do not have a character.
    // (This can happen ocassionally, for example when multiple spaces are next to eachother.)
    // TODO: This will drop formatting information in edge cases--e.g. if a formatting element is followed by multiple spaces.
    // However, hopefully these are uncommon enough that they should not be a big issue.
    filterArr = wordStrArr.map(x => /charParams/i.test(x));
    wordStrArr = wordStrArr.filter((r, i) => filterArr[i]);

    // for(let i=0;i<(wordStrArr.length-1);i++){
    //   let formatEnd = wordStrArr[i].match(/<formatting[^\>]+\>[^\<]*$/i);
    //   if(formatEnd != null){
    //     wordStrArr[i+1] = formatEnd[0] + wordStrArr[i+1];
    //   }
    // }



    bboxes = Array(wordStrArr.length);
    let cuts = Array(wordStrArr.length);
     text = Array(wordStrArr.length);
     text = text.fill("");
    styleArr = Array(wordStrArr.length);
    styleArr = styleArr.fill("normal");
    let wordSusp = Array(wordStrArr.length);
    wordSusp.fill(false);


    for(let i=0;i<wordStrArr.length;i++){
      let wordStr = wordStrArr[i];
      letterArr = [...wordStr.matchAll(abbyyCharRegex)];
      if(typeof(letterArr[0]) == "undefined"){
        console.log(xmlLine);
        console.log(wordStrArr);
        console.log(letterArr);
      }


      if(typeof(letterArr[0][1]) != "undefined"){
        if(dropCap && i==0){
          styleArr[i] = "dropcap";
        } else if(/superscript\=[\'\"](1|true)/i.test(letterArr[0][1])){
          styleArr[i] = "sup";
        } else if(/italic\=[\'\"](1|true)/i.test(letterArr[0][1])){
          styleArr[i] = "italic";
        } else if(/smallcaps\=[\'\"](1|true)/i.test(letterArr[0][1])) {
          styleArr[i] = "small-caps";
        } else {
          styleArr[i] = "normal";
        }
      } else {
        if(i > 0){
          if(styleArr[i-1] == "dropcap"){
            styleArr[i] = "normal";
          } else {
            styleArr[i] = styleArr[i-1];
          }
        }
      }

      // Abbyy will sometimes misidentify capital letters immediately following drop caps as small caps,
      // when they are only small in relation to the drop cap (rather than the main text).
      let dropCapFix = false;
      if(dropCap && i==1 && styleArr[i] == "small-caps"){
        styleArr[i] = "normal";
        dropCapFix = true;
      }


      bboxes[i] = new Array();
      cuts[i] = new Array();

      for(let j=0;j<letterArr.length;j++){
        // Skip letters placed at coordinate 0 (not sure why this happens)
        if(letterArr[j][2] == "0"){continue};
        bboxes[i][j] = new Array();
        bboxes[i][j].push(parseInt(letterArr[j][2]));
        bboxes[i][j].push(parseInt(letterArr[j][3]));
        bboxes[i][j].push(parseInt(letterArr[j][4]));
        bboxes[i][j].push(parseInt(letterArr[j][5]));

        let letterSusp = false;
        if(letterArr[j][6] == "1" || letterArr[j][6] == "true"){
          letterSusp = true;
          wordSusp[i] = true;
        }

        if(dropCapFix){
          letterArr[j][7] = letterArr[j][7].toUpperCase();
        }

         let contentStrLetter = letterArr[j][7];
         text[i] = text[i] + contentStrLetter;

         lineAllHeightArr.push(bboxes[i][j][3] - bboxes[i][j][1]);
         if(ascCharArr.includes(contentStrLetter)){
           lineAscHeightArr.push(bboxes[i][j][3] - bboxes[i][j][1]);
         } else if(xCharArr.includes(contentStrLetter)){
           lineXHeightArr.push(bboxes[i][j][3] - bboxes[i][j][1]);
         }


         if((ascCharArr.includes(contentStrLetter) || xCharArr.includes(contentStrLetter)) && !letterSusp && !dropCapFix && !(dropCap && i==0)){
           //baselineHeightArr.push(bboxes[i][j][3]);
           // To calculate the slope of the baseline (and therefore image angle) the position of each glyph that starts (approximately) on the
           // baseline is compared to the first such glyph.  This is less precise than a true "best fit" approach, but hopefully with enough data
           // points it will all average out.
           if(baselineFirst.length == 0){
             baselineFirst.push(bboxes[i][j][0], bboxes[i][j][3]);
           } else {
             // Sometimes random junk characters in the left margin will be the first character on a line.
             // if(baselineSlopeArr.length < 3 && ((bboxes[i][j][0] - baselineFirst[0]) > (pageDims[1] / 20) || wordSusp[i]) && (wordStrArr.length - i) > 5){
             //   baselineFirst[0] = bboxes[i][j][0];
             //   baselineFirst[1] = bboxes[i][j][1];
             //   baselineSlopeArr = [];
             // } else {
             //   baselineSlopeArr.push((bboxes[i][j][3] - baselineFirst[1]) / (bboxes[i][j][0] - baselineFirst[0]));
             // }

             baselineSlopeArr.push((bboxes[i][j][3] - baselineFirst[1]) / (bboxes[i][j][0] - baselineFirst[0]));

           }
         }

         const charUnicode = String(contentStrLetter.charCodeAt(0));
         const charWidth = bboxes[i][j][2] - bboxes[i][j][0];
         const charHeight = bboxes[i][j][3] - bboxes[i][j][1];

         if(widthPxObjLine[charUnicode] == null){
           widthPxObjLine[charUnicode] = new Array();
           heightPxObjLine[charUnicode] = new Array();
         }
         widthPxObjLine[charUnicode].push(charWidth);
         heightPxObjLine[charUnicode].push(charHeight);

         if(j == 0){
           cuts[i][j] = 0;
         } else {
           cuts[i][j] = bboxes[i][j][0] - bboxes[i][j-1][2];

           var bigramUnicode = letterArr[j-1][7].charCodeAt(0) + "," + letterArr[j][7].charCodeAt(0);
           // Quick fix so it runs--need to figure out how to calculate x-height from Abbyy XML
           var cuts_ex = cuts[i][j];

           if(cutPxObjLine[charUnicode] == null){
             cutPxObjLine[charUnicode] = new Array();
           }
           cutPxObjLine[charUnicode].push(cuts_ex);

           if(kerningPxObjLine[bigramUnicode] == null){
             kerningPxObjLine[bigramUnicode] = new Array();
           }
           kerningPxObjLine[bigramUnicode].push(cuts_ex);
         }
       }
     }

     const lineAllHeight = Math.max(...lineAllHeightArr);
     const lineAscHeight = quantile(lineAscHeightArr, 0.5);
     const lineXHeight = quantile(lineXHeightArr, 0.5);
     //const baseline = quantile(baselineHeightArr, 0.5);
     if(lineXHeight != null){
       for(const [key,value] of Object.entries(widthPxObjLine)){
         if(parseInt(key) < 33){continue};

        if(widthObjPage[key] == null){
           widthObjPage[key] = new Array();
         }
         for(let k=0;k<value.length;k++){
           widthObjPage[key].push(value[k] / lineXHeight);
         }
       }

       for(const [key,value] of Object.entries(heightPxObjLine)){
         if(parseInt(key) < 33){continue};

        if(heightObjPage[key] == null){
           heightObjPage[key] = new Array();
         }
         for(let k=0;k<value.length;k++){
           heightObjPage[key].push(value[k] / lineXHeight);
         }
       }



       for(const [key,value] of Object.entries(cutPxObjLine)){
         if(parseInt(key) < 33){continue};

        if(cutObjPage[key] == null){
           cutObjPage[key] = new Array();
         }
         for(let k=0;k<value.length;k++){
           cutObjPage[key].push(value[k] / lineXHeight);
         }
       }
       for(const [key,value] of Object.entries(kerningPxObjLine)){
         if(parseInt(key) < 33){continue};

        if(kerningObjPage[key] == null){
           kerningObjPage[key] = new Array();
         }
         for(let k=0;k<value.length;k++){
           kerningObjPage[key].push(value[k] / lineXHeight);
         }
       }

     }

     const baselineSlope = baselineSlopeArr.length == 0 ? 0 : quantile(baselineSlopeArr, 0.5);

     const baselinePoint = baselineFirst[1] - parseInt(lineBoxArr[5]) - baselineSlope * (baselineFirst[0] - parseInt(lineBoxArr[2]));

     //console.log(baselineSlopeArr);


     let xmlOut = "<span class='ocr_line' title=\"bbox " + lineBoxArr[2] + " " + lineBoxArr[3] + " " + lineBoxArr[4] + " " + lineBoxArr[5];
     if(baselineSlopeArr.length > 0){
       xmlOut = xmlOut + ";baseline " + baselineSlope + " " + baselinePoint;
     }
     xmlOut = xmlOut + ";x_size " + lineAllHeight;
     if(lineAscHeight != null && lineXHeight != null){
       xmlOut = xmlOut + " x_ascenders " + (lineAscHeight - lineXHeight) + " x_descenders " + (lineAllHeight - lineAscHeight);
     } else if(lineAscHeight != null){
       xmlOut = xmlOut + " x_descenders " + (lineAllHeight - lineAscHeight);
     }


     xmlOut = xmlOut + "\">";
     for(let i=0;i<text.length;i++){
       if(text[i].trim() == "") {continue};
        bboxesI = bboxes[i];
       const bboxesILeft = bboxesI[0][0];
       // Abbyy XML can strangely give coordinates of 0 (this has been observed for some but not all superscripts), so these must be filtered out,
       // and it cannot be assumed that the rightmost letter has the maximum x coordinate.
       // TODO: Figure out why this happens and whether these glyphs should be dropped completely.
       const bboxesIRight = Math.max(...bboxesI.map(x => x[2]));

       const bboxesITop = Math.min(...bboxesI.map(x => x[1]).filter(x => x > 0));
       const bboxesIBottom = Math.max(...bboxesI.map(x => x[3]));

       xmlOut = xmlOut + "<span class='ocrx_word' id='word_" + (pageNum+1) + "_" + (lineNum+1) + "_" + (i+1) + "' title='bbox " + bboxesILeft + " " + bboxesITop + " " + bboxesIRight + " " + bboxesIBottom;
       if(wordSusp[i]){
         xmlOut = xmlOut + ";x_wconf 0";
       } else {
         xmlOut = xmlOut + ";x_wconf 100";
       }
      xmlOut = xmlOut + "\'"
      if(styleArr[i] == "italic"){
        xmlOut = xmlOut + " style='font-style:italic'" + ">" + text[i] + "</span>";;
      } else if(styleArr[i] == "small-caps"){
        xmlOut = xmlOut + " style='font-variant:small-caps'" + ">" + text[i] + "</span>";
      } else if(styleArr[i] == "sup"){
        xmlOut = xmlOut + ">" + "<sup>" + text[i] + "</sup>" + "</span>";
      } else if(styleArr[i] == "dropcap"){
        xmlOut = xmlOut + ">" + "<span class='ocr_dropcap'>" + text[i] + "</span>" + "</span>";
      } else {
        xmlOut = xmlOut + ">" + text[i] + "</span>";
      }

     }
     xmlOut = xmlOut + "</span>"
     return([xmlOut, baselineSlope]);
  }


  let lineStrArr = xmlPage.split(/\<\/line\>/);
  let xmlOut = "<div class='ocr_page'>";
  let angleRisePage = new Array();
  for(let i=0;i<lineStrArr.length;i++){
    const lineInt = convertLineAbbyy(lineStrArr[i], i, pageNum);
    angleRisePage.push(lineInt[1]);
    xmlOut = xmlOut + lineInt[0];
  }
  xmlOut = xmlOut + "</div>";

  let angleRiseMedian = mean50(angleRisePage);

  const angleOut = Math.asin(angleRiseMedian) * (180/Math.PI);


  let lineLeftAdj = new Array;
  for(let i = 0; i < lineLeft.length; i++){
    lineLeftAdj.push(lineLeft[i] + angleRiseMedian * lineTop[i]);
  }
  let leftOut = quantile(lineLeft, 0.2);
  let leftAdjOut = quantile(lineLeftAdj, 0.2) - leftOut;
  // With <5 lines either a left margin does not exist (e.g. a photo or title page) or cannot be reliably determined
  if(lineLeft.length < 5){
    leftOut = null;
  }

  //const angleOut = 0;
  //const leftOut = 0;
  //const leftAdjOut = 0;
  const dimsOut = pageDims;
  const widthOut = widthObjPage;
  const heightOut = heightObjPage;
  const cutOut = cutObjPage;
  const kerningOut = kerningObjPage;
  return([xmlOut,dimsOut,angleOut,leftOut,leftAdjOut,widthOut,heightOut,new Object,cutOut,kerningOut,""]);

}
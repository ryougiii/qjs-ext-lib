"use strict;"

/*
    String helpers. Mostly for internal use
 */


/**
 * Convert an {Uint8Array} to string
 * Can be used after {os.read}
 *
 * @param {Uint8Array} bytesArray array to convert
 * @param {object} opt options
 * @param {integer} opt.from index to start reading from (default = 0)
 * @param {integer} opt.to index to stop reading from (excluded).
 *                         All bytes from {from} up to the end will be
 *                         processes if not defined
 *
 * @return {string}
 */
const bytesArrayToStr = (bytesArray, opt) => {
    let fromIndex = 0;
    let toIndex = bytesArray.length;
    if (undefined !== opt) {
        if (undefined !== opt.from && opt.from >= 0) {
            fromIndex = opt.from;
        }
        if (undefined !== opt.to && 
            opt.to <= bytesArray.length &&
            opt.to >= fromIndex) {
                toIndex = opt.to;
        }
    }

    let finalStr = '';
    let i = fromIndex;
    let char, char2, char3, tmpStr;

    while (i < toIndex) {
        char = bytesArray[i++];
        if (0 == char) {
            continue;
        }
        switch (char >> 4) {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx
                tmpStr = String.fromCharCode(char);
                finalStr += tmpStr;
                break;
            case 12: case 13:
                // 110x xxxx   10xx xxxx
                char2 = bytesArray[i++];
                tmpStr = String.fromCharCode(((char & 0x1F) << 6) | (char2 & 0x3F));
                finalStr += tmpStr;
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = bytesArray[i++];
                char3 = bytesArray[i++];
                tmpStr = String.fromCharCode(((char & 0x0F) << 12) | ((char2 & 0x3F) << 6) | ((char3 & 0x3F) << 0));
                finalStr += tmpStr;
                break;
        }
    }

    return finalStr;
}

/**
 * Convert a {string} to a {Uint8Array}
 * Can be use with {os.write}
 *
 * Borrowed from https://gist.github.com/joni/3760795
 *
 * @param {string} str string to convert
 * @param {object} opt options
 * @param {Uint8Array} opt.bytesArray if defined, the underlying buffer will be reused instead of allocating a new one
 * @param {integer} opt.from index to start writing to (default = 0).
 *                           Will be ignored if {opt.bytesArray} is not defined
 * @param {integer} opt.to index to stop writting to (excluded).
 *                         By default, data will be written up to the end of the array.
 *                         Will be ignored if {opt.bytesArray} is not defined  
 *
 * @return {Uint8Array} 
 */
const strToBytesArray = (str, opt) => {
    /*
        Only one type of array will be defined
        - if {opt.bytesArray} is defined, it will be used
        - otherwise an empty {regularArray} will be allocated
     */
    let bytesArray = undefined;
    // index of the next byte which will be written
    let bytesArrayNextIndex = 0;
    // index of the last byte which can be written
    let bytesArrayLastIndex = 0;
    
    let regularArray = undefined;
    
    if (undefined !== opt) {
        if (undefined !== opt.bytesArray) {
            let fromIndex = 0;
            let toIndex = opt.bytesArray.length;
            if (undefined !== opt.from && opt.from >= 0) {
                fromIndex = opt.from;
            }
            if (undefined !== opt.to && 
                opt.to <= opt.bytesArray.length &&
                opt.to >= fromIndex) {
                    toIndex = opt.to;
            }
            bytesArray = new Uint8Array(opt.bytesArray.buffer, fromIndex, toIndex - fromIndex);
            bytesArrayLastIndex = bytesArray.length - 1;
        }
    }
    if (undefined === bytesArray) {
        regularArray = [];
    }

    let charCode;
    for (let i = 0, length = str.length; i < length; ++i) {
        charCode = str.charCodeAt(i);
        if (charCode < 0x80) {
            if (undefined === bytesArray) {
                regularArray.push(charCode);
            }
            else {
                bytesArray[bytesArrayNextIndex++] = charCode;
            }
        }
        else if (charCode < 0x800) {
            if (undefined === bytesArray) {
                regularArray.push(0xc0 | (charCode >> 6),
                                  0x80 | (charCode & 0x3f));
            }
            else {
                bytesArray[bytesArrayNextIndex++] = 0xc0 | (charCode >> 6);
                bytesArray[bytesArrayNextIndex++] = 0x80 | (charCode & 0x3f);
            }
        }
        else if (charCode < 0xd800 || charCode >= 0xe000) {
            if (undefined === bytesArray) {
                regularArray.push(0xe0 | (charCode >> 12),
                                  0x80 | ((charCode>>6) & 0x3f),
                                  0x80 | (charCode & 0x3f));
            }
            else {
                bytesArray[bytesArrayNextIndex++] = 0xe0 | (charCode >> 12);
                bytesArray[bytesArrayNextIndex++] = 0x80 | ((charCode>>6) & 0x3f);
                bytesArray[bytesArrayNextIndex++] = 0x80 | (charCode & 0x3f);
            }
        }
        // surrogate pair
        else {
            ++i;
            // UTF-16 encodes 0x10000-0x10FFFF by
            // subtracting 0x10000 and splitting the
            // 20 bits of 0x0-0xFFFFF into two halves
            charCode = 0x10000 + (((charCode & 0x3ff)<<10) | (str.charCodeAt(i) & 0x3ff));
            if (undefined === bytesArray) {
                regularArray.push(0xf0 | (charCode >>18),
                                  0x80 | ((charCode>>12) & 0x3f),
                                  0x80 | ((charCode>>6) & 0x3f),
                                  0x80 | (charCode & 0x3f));
            }
            else {
                bytesArray[bytesArrayNextIndex++] = 0xf0 | (charCode >>18);
                bytesArray[bytesArrayNextIndex++] = 0x80 | ((charCode>>12) & 0x3f);
                bytesArray[bytesArrayNextIndex++] = 0x80 | ((charCode>>6) & 0x3f);
                bytesArray[bytesArrayNextIndex++] = 0x80 | (charCode & 0x3f);
            }
        }
        if (undefined !== bytesArray) {
            if (bytesArrayNextIndex > bytesArrayLastIndex) {
                break;
            }
        }
    }
    if (undefined === bytesArray) {
        return Uint8Array.from(regularArray);
    }
    // ensure we return a typed array with the exact required size
    return new Uint8Array(bytesArray, 0, bytesArrayNextIndex);
}

/**
 * Split a string into multiple lines
 *
 * @param {string} content new content to split
 * @param {string} incompleteLine previous incomplete line
 * @param {boolean} skipBlankLines if {true} empty lines will be ignored (default = {false})
 *
 * @return {object} {lines:string[], incompleteLine:string}
 */
const getLines = (content, incompleteLine, skipBlankLines = false) => {
    if (undefined === incompleteLine) {
        incompleteLine = '';
    }
    const lines = [];
    let index;
    let start = 0;
    let str;
    while (-1 != (index = content.indexOf("\n", start))) {
        str = content.substring(start, index);
        // remove '\r' character in case we have one
        if (str.endsWith('\r')) {
            str = str.slice(0, -1);
        }
        start = index + 1;
        incompleteLine += str;
        // ignore empty lines if requested
        if ('' == incompleteLine) {
            if (!skipBlankLines) {
                lines.push(incompleteLine);
            }
        }
        else {
            lines.push(incompleteLine);
            incompleteLine = '';
        }
    }
    incompleteLine += content.substring(start);
    const result = {
        lines:lines,
        incompleteLine:incompleteLine
    };
    return result;
}

export {
    bytesArrayToStr,
    strToBytesArray,
    getLines
}

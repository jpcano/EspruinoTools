/**
 Copyright 2014 Gordon Williams (gw@pur3.co.uk)

 This Source Code is subject to the terms of the Mozilla Public
 License, v2.0. If a copy of the MPL was not distributed with this
 file, You can obtain one at http://mozilla.org/MPL/2.0/.

 ------------------------------------------------------------------
  Utilities
 ------------------------------------------------------------------
**/
"use strict";
(function(){

  /// Chunk size that files are uploaded/downloaded to Espruino in
  var CHUNKSIZE = 384;// or any multiple of 96 for atob/btoa

  function init() {

  }

  function isWindows() {
    return (typeof navigator!="undefined") && navigator.userAgent.indexOf("Windows")>=0;
  }

  function isLinux() {
    return (typeof navigator!="undefined") && navigator.userAgent.indexOf("Linux")>=0;
  }

  function isAppleDevice() {
    return (typeof navigator!="undefined") && (typeof window!="undefined") && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isChrome(){
    return navigator.userAgent.indexOf("Chrome")>=0;
  }

  function isFirefox(){
    return navigator.userAgent.indexOf("Firefox")>=0;
  }

  function getChromeVersion(){
    return parseInt(window.navigator.appVersion.match(/Chrome\/(.*?) /)[1].split(".")[0]);
  }

  function isNWApp() {
    return (typeof require === "function") && (typeof require('nw.gui') !== "undefined");
  }

  function isChromeWebApp() {
    return ((typeof chrome === "object") && chrome.app && chrome.app.window);
  }

  function isProgressiveWebApp() {
    return !isNWApp() && !isChromeWebApp() && window && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  }

  function hasNativeTitleBar() {
    return !isNWApp() && !isChromeWebApp();
  }

  function isCrossOriginSubframe() {
    if (!window.parent) return false;
    try {
      return window.parent.location.host != window.location.host;
      // if actually cross origin, this will throw "Blocked a frame with origin ... from accessing a cross-origin frame."
    } catch (e) {
      return true;
    }
  }

  /// Does the currently connected board have an ARM processor that can execute Thumb code?
  function isARMThumb() {
    var data = Espruino.Core.Env.getData();
    if (!data || !data.chip) return false;
    var family = data.chip.family;
    return ["NRF51","NRF52","STM32F1","STM32F3","STM32F4","STM32L4"].includes(family);
  }


  function escapeHTML(text, escapeSpaces)
  {
    escapeSpaces = typeof escapeSpaces !== 'undefined' ? escapeSpaces : true;

    var chr = { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;', ' ' : (escapeSpaces ? '&nbsp;' : ' ') };

    return text.toString().replace(/["&<> ]/g, function (a) { return chr[a]; });
  }

  /* Google Docs, forums, etc tend to break code by replacing characters with
  fancy unicode versions. Un-break the code by undoing these changes */
  function fixBrokenCode(text)
  {
    // make sure we ignore `&shy;` - which gets inserted
    // by the forum's code formatter
    text = text.replace(/\u00AD/g,'');
    // replace quotes that get auto-replaced by Google Docs and other editors
    text = text.replace(/[\u201c\u201d]/g,'"');
    text = text.replace(/[\u2018\u2019]/g,'\'');

    return text;
  }


  function getSubString(str, from, len) {
    if (len == undefined) {
      return str.substr(from, len);
    } else {
      var s = str.substr(from, len);
      while (s.length < len) s+=" ";
      return s;
    }
  }

  /** Get a Lexer to parse JavaScript - this is really very nasty right now and it doesn't lex even remotely properly.
   * It'll return {type:"type", str:"chars that were parsed", value:"string", startIdx: Index in string of the start, endIdx: Index in string of the end}, until EOF when it returns undefined */
  function getLexer(str) {
    // Nasty lexer - no comments/etc
    var chAlpha="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
    var chNum="0123456789";
    var chAlphaNum = chAlpha+chNum;
    var chWhiteSpace=" \t\n\r";
    // https://www-archive.mozilla.org/js/language/js20-2000-07/rationale/syntax.html#regular-expressions
    var allowedRegExIDs = ["abstract","break","case","catch","class","const","continue","debugger","default",
    "delete","do","else","enum","eval","export","extends","field","final","finally","for","function","goto",
    "if","implements","import","in","instanceof","native","new","package","private","protected","public",
    "return","static","switch","synchronized","throw","throws","transient","try","typeof","var","volatile","while","with"];
    var allowedRegExChars = ['!','%','&','*','+','-','/','<','=','>','?','[','{','}','(',',',';',':']; // based on Espruino jslex.c (may not match spec 100%)
    var ch;
    var idx = 0;
    var lineNumber = 1;
    var nextCh = function() {
      ch = str[idx++];
      if (ch=="\n") lineNumber++;
    };
    var backCh = function() {
      idx--;
      ch = str[idx-1];
    };
    nextCh();
    var isIn = function(s,c) { return s.indexOf(c)>=0; } ;
    var lastToken = {};
    var nextToken = function() {
      while (isIn(chWhiteSpace,ch)) {
        nextCh();
      }
      if (ch==undefined) return undefined;
      if (ch=="/") {
        nextCh();
        if (ch=="/") {
          // single line comment
          while (ch!==undefined && ch!="\n") nextCh();
          return nextToken();
        } else if (ch=="*") {
          nextCh();
          var last = ch;
          nextCh();
          // multiline comment
          while (ch!==undefined && !(last=="*" && ch=="/")) {
            last = ch;
            nextCh();
          }
          nextCh();
          return nextToken();
        } else {
          backCh(); // push the char back
        }
      }
      var s = "";
      var type, value;
      var startIdx = idx-1;
      if (isIn(chAlpha,ch)) { // ID
        type = "ID";
        do {
          s+=ch;
          nextCh();
        } while (isIn(chAlphaNum,ch));
      } else if (isIn(chNum,ch)) { // NUMBER
        type = "NUMBER";
        var chRange = chNum;
        if (ch=="0") { // Handle
          s+=ch;
          nextCh();
          if ("xXoObB".indexOf(ch)>=0) {
            if (ch=="b" || ch=="B") chRange="01";
            if (ch=="o" || ch=="O") chRange="01234567";
            if (ch=="x" || ch=="X") chRange="0123456789ABCDEFabcdef";
            s+=ch;
            nextCh();
          }
        }
        while (isIn(chRange,ch) || ch==".") {
          s+=ch;
          nextCh();
        }
      } else if (isIn("\"'`/",ch)) { // STRING or regex
        s+=ch;
        var q = ch;
        nextCh();
        // Handle case where '/' is just a divide character, not RegEx
        if (s=='/' && (lastToken.type=="STRING" || lastToken.type=="NUMBER" ||
                       (lastToken.type=="ID" && !allowedRegExIDs.includes(lastToken.str)) ||
                       (lastToken.type=="CHAR" && !allowedRegExChars.includes(lastToken.str))
                      )) {
          // https://www-archive.mozilla.org/js/language/js20-2000-07/rationale/syntax.html#regular-expressions
          type = "CHAR";
        } else {
          type = "STRING"; // should we report this as REGEX?
          value = "";

          while (ch!==undefined && ch!=q) {
            if (ch=="\\") { // handle escape characters
              nextCh();
              var escape = '\\'+ch;
              // var escapeExtra = 0;
              if (ch=="x") {
                nextCh();escape += ch;
                nextCh();escape += ch;
                value += String.fromCharCode(parseInt(escape.substr(2), 16));
              } else if (ch=="u") {
                nextCh();escape += ch;
                nextCh();escape += ch;
                nextCh();escape += ch;
                nextCh();escape += ch;
                value += String.fromCharCode(parseInt(escape.substr(2), 16));
              } else {
                try {
                  value += JSON.parse('"'+escape+'"');
                } catch (e) {
                  value += escape;
                }
              }
              s += escape;
            } else {
              s+=ch;
              value += ch;
            }
            nextCh();
          }
          if (ch!==undefined) s+=ch;
          nextCh();
        }
      } else {
        type = "CHAR";
        s+=ch;
        nextCh();
      }
      if (value===undefined) value=s;
      return lastToken={type:type, str:s, value:value, startIdx:startIdx, endIdx:idx-1, lineNumber:lineNumber};
    };

    return {
      next : nextToken
    };
  }

  /** Count brackets in a string - will be 0 if all are closed */
  function countBrackets(str) {
    var lex = getLexer(str);
    var brackets = 0;
    var tok = lex.next();
    while (tok!==undefined) {
      if (tok.str=="(" || tok.str=="{" || tok.str=="[") brackets++;
      if (tok.str==")" || tok.str=="}" || tok.str=="]") brackets--;
      tok = lex.next();
    }
    return brackets;
  }

  /** Try and get a prompt from Espruino - if we don't see one, issue Ctrl-C
   * and hope it comes back. Calls callback with first argument true if it
     had to Ctrl-C out */
  function getEspruinoPrompt(callback) {
    if (Espruino.Core.Terminal!==undefined &&
        Espruino.Core.Terminal.getTerminalLine()==">") {
      console.log("Found a prompt... great!");
      return callback();
    }

    var receivedData = "";
    var prevReader = Espruino.Core.Serial.startListening(function (readData) {
      var bufView = new Uint8Array(readData);
      for(var i = 0; i < bufView.length; i++) {
        receivedData += String.fromCharCode(bufView[i]);
      }
      if (receivedData[receivedData.length-1] == ">") {
        if (receivedData.substr(-6)=="debug>") {
          console.log("Got debug> - sending Ctrl-C to break out and we'll be good");
          Espruino.Core.Serial.write('\x03');
        } else {
          if (receivedData == "\r\n=undefined\r\n>")
            receivedData=""; // this was just what we expected - so ignore it

          console.log("Received a prompt after sending newline... good!");
          clearTimeout(timeout);
          nextStep();
        }
      }
    });
    // timeout in case something goes wrong...
    var hadToBreak = false;
    var timeout = setTimeout(function() {
      console.log("Got "+JSON.stringify(receivedData));
      // if we haven't had the prompt displayed for us, Ctrl-C to break out of what we had
      console.log("No Prompt found, got "+JSON.stringify(receivedData[receivedData.length-1])+" - issuing Ctrl-C to try and break out");
      Espruino.Core.Serial.write('\x03');
      hadToBreak = true;
      timeout = setTimeout(function() {
        console.log("Still no prompt - issuing another Ctrl-C");
        Espruino.Core.Serial.write('\x03');
        nextStep();
      },500);
    },500);
    // when we're done...
    var nextStep = function() {
      // send data to console anyway...
      if(prevReader) prevReader(receivedData);
      receivedData = "";
      // start the previous reader listening again
      Espruino.Core.Serial.startListening(prevReader);
      // call our callback
      if (callback) callback(hadToBreak);
    };
    // send a newline, and we hope we'll see '=undefined\r\n>'
    Espruino.Core.Serial.write('\n');
  }

  /** Return the value of executing an expression on the board. If
  If options.exprPrintsResult=false/undefined the actual value returned by the expression is returned.
  If options.exprPrintsResult=true, whatever expression prints to the console is returned
  options.maxTimeout (default 30) is how long we're willing to wait (in seconds) for data if Espruino keeps transmitting */
  function executeExpression(expressionToExecute, callback, options) {
    options = options||{};
    options.exprPrintsResult = !!options.exprPrintsResult;
    options.maxTimeout = options.maxTimeout||30;
    var receivedData = "";
    var hadDataSinceTimeout = false;
    var allDataSent = false;

    var progress = 100;
    function incrementProgress() {
      if (progress==100) {
        Espruino.Core.Status.setStatus("Receiving...",100);
        progress=0;
      } else {
        progress++;
        Espruino.Core.Status.incrementProgress(1);
      }
    }

    function getProcessInfo(expressionToExecute, callback) {
      var prevReader = Espruino.Core.Serial.startListening(function (readData) {
        var bufView = new Uint8Array(readData);
        for(var i = 0; i < bufView.length; i++) {
          receivedData += String.fromCharCode(bufView[i]);
        }
        if(allDataSent) incrementProgress();
        // check if we got what we wanted
        var startProcess = receivedData.indexOf("< <<");
        var endProcess = receivedData.indexOf(">> >", startProcess);
        if(startProcess >= 0 && endProcess > 0){
          // All good - get the data!
          var result = receivedData.substring(startProcess + 4,endProcess);
          console.log("Got "+JSON.stringify(receivedData));
          // strip out the text we found
          receivedData = receivedData.substr(0,startProcess) + receivedData.substr(endProcess+4);
          // Now stop time timeout
          if (timeout) clearInterval(timeout);
          timeout = "cancelled";
          // Do the next stuff
          nextStep(result);
        } else if (startProcess >= 0) {
          // we got some data - so keep waiting...
          hadDataSinceTimeout = true;
        }
      });

      // when we're done...
      var nextStep = function(result) {
        Espruino.Core.Status.setStatus("");
        // start the previous reader listing again
        Espruino.Core.Serial.startListening(prevReader);
        // forward the original text to the previous reader
        if(prevReader) prevReader(receivedData);
        // run the callback
        callback(result);
      };

      var timeout = undefined;
      // Don't Ctrl-C, as we've already got ourselves a prompt with Espruino.Core.Utils.getEspruinoPrompt
      var cmd;
      if (options.exprPrintsResult)
        cmd  = '\x10print("<","<<");'+expressionToExecute+';print(">>",">")\n';
      else
        cmd  = '\x10print("<","<<",JSON.stringify('+expressionToExecute+'),">>",">")\n';

      Espruino.Core.Serial.write(cmd,
                                 undefined, function() {
        allDataSent = true;
        // now it's sent, wait for data
        var minTimeout = 2; // seconds - how long we wait if we're not getting data
        var pollInterval = 200; // milliseconds
        var timeoutSeconds = 0;
        if (timeout != "cancelled") {
          timeout = setInterval(function onTimeout(){
            incrementProgress();
            timeoutSeconds += pollInterval/1000;
            // if we're still getting data, keep waiting for up to 10 secs
            if (hadDataSinceTimeout && timeoutSeconds<options.maxTimeout) {
              hadDataSinceTimeout = false;
            } else if (timeoutSeconds > minTimeout) {
              // No data yet...
              // OR we keep getting data for > options.maxTimeout seconds
              clearInterval(timeout);
              console.warn("No result found for "+JSON.stringify(expressionToExecute)+" - just got "+JSON.stringify(receivedData));
              nextStep(undefined);
            }
          }, pollInterval);
        }
      });
    }

    if(Espruino.Core.Serial.isConnected()){
      Espruino.Core.Utils.getEspruinoPrompt(function() {
        getProcessInfo(expressionToExecute, callback);
      });
    } else {
      console.error("executeExpression called when not connected!");
      callback(undefined);
    }
  }

  // Download a file - storageFile or normal file
  function downloadFile(fileName, callback) {
    var options = {exprPrintsResult:true, maxTimeout:600}; // ten minute timeout
    executeExpression(`(function(filename) {
var s = require("Storage").read(filename);
if(s){ for (var i=0;i<s.length;i+=${CHUNKSIZE}) console.log(btoa(s.substr(i,${CHUNKSIZE}))); } else {
var f=require("Storage").open(filename,"r");var d=f.read(${CHUNKSIZE});
while (d!==undefined) {console.log(btoa(d));d=f.read(${CHUNKSIZE});}
}})(${JSON.stringify(fileName)});`, function(contents) {
        if (contents===undefined) callback();
        else callback(atob(contents));
      }, options);
  }

  // Get the JS needed to upload a file
  function getUploadFileCode(fileName, contents) {
    var js = [];
    if ("string" != typeof contents)
      throw new Error("Expecting a string for contents");
    if (fileName.length==0 || fileName.length>28)
      throw new Error("Invalid filename length");
    var fn = JSON.stringify(fileName);
    for (var i=0;i<contents.length;i+=CHUNKSIZE) {
      var part = contents.substr(i,CHUNKSIZE);
      js.push(`require("Storage").write(${fn},atob(${JSON.stringify(btoa(part))}),${i}${(i==0)?","+contents.length:""})`);
    }
    return js.join("\n");
  }

  // Upload a file
  function uploadFile(fileName, contents, callback) {
    var js = getUploadFileCode(fileName, contents).replace(/\n/g,"\n\x10");
    // executeStatement prepends other code onto the command, so don't add `\x10` at the start of line as then it just ends up in the middle of what's sent
    Espruino.Core.Utils.executeStatement(js, callback);
  }

  function versionToFloat(version) {
    return parseFloat(version.trim().replace("v","."));
  }

  /// Gets a URL, and returns callback(data) or callback(undefined) on error. options={method:"GET/POST", data:{a:1,b:2}}
  function getURL(url, callback, options) {
    if (options===undefined) options={};
    if (!options.method) options.method="GET";
    Espruino.callProcessor("getURL", { url : url, data : undefined, method : options.method }, function(result) {
      if (result.data!==undefined) {
        callback(result.data);
      } else {
        // encode data to send
        var formData = null;
        if (options.data)
          formData = Object.keys(options.data).map(key=> encodeURIComponent(key)+"="+encodeURIComponent(options.data[key])).join("&");
        // do the request
        var resultUrl = result.url ? result.url : url;
        if (typeof process === 'undefined') {
          // Web browser
          var xhr = new XMLHttpRequest();
          xhr.responseType = "text";
          xhr.addEventListener("load", function () {
            if (xhr.status === 200) {
              callback(xhr.response.toString());
            } else {
              console.error("getURL("+JSON.stringify(url)+") error : HTTP "+xhr.status);
              callback(undefined);
            }
          });
          xhr.addEventListener("error", function (e) {
            console.error("getURL("+JSON.stringify(url)+") error "+e);
            callback(undefined);
          });
          xhr.open(options.method, url, true);
          if (formData!==null)
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
          xhr.send(formData);
        } else {
          // Node.js
          if (resultUrl.substr(0,4)=="http") {
            var m = resultUrl[4]=="s"?"https":"http";

            var http_options;
            if (Espruino.Config.MODULE_PROXY_ENABLED) {
              http_options = {
                host: Espruino.Config.MODULE_PROXY_URL,
                port: Espruino.Config.MODULE_PROXY_PORT,
                path: resultUrl,
                method: options.method
              };
            } else {
              var p = require('url').parse(resultUrl);
              http_options = {
                host: p.host,
                port: p.port,
                path: p.path,
                method: options.method
              };
            }
            if (formData!==null)
              http_options.headers = { "Content-Type" : "application/x-www-form-urlencoded" };
            console.log(http_options);
            var req = require(m).request(http_options, function(res) {
              if (res.statusCode != 200) {
                console.log("Espruino.Core.Utils.getURL: got HTTP status code "+res.statusCode+" for "+url);
                return callback(undefined);
              }
              var data = "";
              res.on("data", function(d) { data += d; });
              res.on("end", function() {
                callback(data);
              });
            }).on('error', function(err) {
              console.error("getURL("+JSON.stringify(url)+") error : "+err);
              callback(undefined);
            });
            if (formData!==null)
              req.write(formData);
            req.end();
          } else {
            require("fs").readFile(resultUrl, function(err, d) {
              if (err) {
                console.error(err);
                callback(undefined);
              } else
                callback(d.toString());
            });
          }
        }
      }
    });
  }

  /// Gets a URL as a Binary file, returning callback(err, ArrayBuffer)
  var getBinaryURL = function(url, callback) {
    console.log("Downloading "+url);
    Espruino.Core.Status.setStatus("Downloading binary...");
    var xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";
    xhr.addEventListener("load", function () {
      if (xhr.status === 200) {
        Espruino.Core.Status.setStatus("Done.");
        var data = xhr.response;
        callback(undefined,data);
      } else
        callback("Error downloading file - HTTP "+xhr.status);
    });
    xhr.addEventListener("error", function () {
      callback("Error downloading file");
    });
    xhr.open("GET", url, true);
    xhr.send(null);
  };

  /// Gets a URL as JSON, and returns callback(data) or callback(undefined) on error
  function getJSONURL(url, callback) {
    getURL(url, function(d) {
      if (!d) return callback(d);
      var j;
      try { j=JSON.parse(d); } catch (e) { console.error("Unable to parse JSON",d); }
      callback(j);
    });
  }

  function isURL(text) {
    return (new RegExp( '(http|https)://' )).test(text);
  }

  /* Are we served from a secure location so we're
   forced to use a secure get? */
  function needsHTTPS() {
    if (typeof window==="undefined" || !window.location) return false;
    return window.location.protocol=="https:";
  }

  /* Open a file load dialog.
  options = {
   id :  ID is to ensure that subsequent calls with  the same ID remember the last used directory.
   type :
     type=="text" => (default) Callback is called with a string
     type=="arraybuffer" => Callback is called with an arraybuffer
   mimeType : (optional) comma-separated list of accepted mime types for files or extensions (eg. ".js,application/javascript")

   callback(contents, mimeType, fileName)
  */
  function fileOpenDialog(options, callback) {
    function readerLoaded(e,files,i,options,fileLoader) {
    /* Doing reader.readAsText(file) interprets the file as UTF8
      which we don't want. */
      var result;
      if (options.type=="text") {
        var a = new Uint8Array(e.target.result);
        result = "";
        for (var j=0;j<a.length;j++)
          result += String.fromCharCode(a[j]);
      } else
        result = e.target.result;
      fileLoader.callback(result, files[i].type, files[i].name);


      // If there's a file left to load
      if (i < files.length - 1 && options.multi) {
        // Load the next file
        setupReader(files, i+1,options,fileLoader);
      } else {
        fileLoader.callback = undefined;
      }
  }
  function setupReader(files,i,options,fileLoader) {
    var reader = new FileReader();
    reader.onload = function(e) {
      readerLoaded(e,files,i,options,fileLoader)
    };
    if (options.type=="text" || options.type=="arraybuffer") reader.readAsArrayBuffer(files[i]);
    else throw new Error("fileOpenDialog: unknown type "+options.type);
  }
    options = options||{};
    options.type = options.type||"text";
    options.id = options.id||"default";
    var loaderId = options.id+"FileLoader";
    var fileLoader = document.getElementById(loaderId);
    if (!fileLoader) {
      fileLoader = document.createElement("input");
      fileLoader.setAttribute("id", loaderId);
      fileLoader.setAttribute("type", "file");
      fileLoader.setAttribute("style", "z-index:-2000;position:absolute;top:0px;left:0px;");
      if (options.multi)
        fileLoader.setAttribute("multiple","multiple");
      if (options.mimeType)
        fileLoader.setAttribute("accept",options.mimeType);
      fileLoader.addEventListener('click', function(e) {
        e.target.value = ''; // handle repeated upload of the same file
      });
      fileLoader.addEventListener('change', function(e) {
        if (!fileLoader.callback) return;

        var files = e.target.files;
        setupReader(files,0,options,fileLoader);

      }, false);
      document.body.appendChild(fileLoader);
    }
    fileLoader.callback = callback;
    fileLoader.click();
  }

  /* Save a file with a save file dialog (data=String). callback(savedFileName) only called in chrome app case when we know the filename*/
  function fileSaveDialog(data, filename, callback) {
    function errorHandler() {
      Espruino.Core.Notifications.error("Error Saving", true);
    }

    var rawdata = new Uint8Array(data.length);
    for (var i=0;i<data.length;i++) rawdata[i]=data.charCodeAt(i);
    var fileBlob = new Blob([rawdata.buffer], {type: "text/plain"});

    if (typeof chrome !== 'undefined' && chrome.fileSystem) {
      // Chrome Web App / NW.js
      chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName:filename}, function(writableFileEntry) {
        if (!writableFileEntry) return; // cancelled
        writableFileEntry.createWriter(function(writer) {
          writer.onerror = errorHandler;
          // when truncation has finished, write
          writer.onwriteend = function(e) {
            writer.onwriteend = function(e) {
              console.log('FileWriter: complete');
              if (callback) callback(writableFileEntry.name);
            };
            console.log('FileWriter: writing');
            writer.write(fileBlob);
          };
          // truncate
          console.log('FileWriter: truncating');
          writer.truncate(fileBlob.size);
        }, errorHandler);
      });
    } else {
      var a = document.createElement("a");
      var url = URL.createObjectURL(fileBlob);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
      }, 0);
    }
  }

  /** Bluetooth device names that we KNOW run Espruino */
  var recongisedDevices = [
       "Puck.js", "Pixl.js", "MDBT42Q", "Espruino", "Badge", "Thingy", "RuuviTag", "iTracker", "Smartibot", "Bangle.js", "Micro:bit"
  ];

  function recognisedBluetoothDevices() {
    return recongisedDevices;
  }

  function addRecognisedDeviceName(name){
    if (name) recongisedDevices.push(name);
  }

  var recognisedDeviceAddresses = [];

  function addRecognisedDeviceAddress(address){
    if (address) recognisedDeviceAddresses.push(address);
  }

  /** If we can't find service info, add devices
  based only on their name/address */
  function isRecognisedBluetoothDevice(name, address) {
    if (address && recognisedDeviceAddresses.includes(address)) return true;
    if (!name) return false;
    var devs = recognisedBluetoothDevices();
    for (var i=0;i<devs.length;i++)
      if (name.substr(0, devs[i].length) == devs[i])
        return true;
    return false;
  }


  function getVersion(callback) {
    var xmlhttp = new XMLHttpRequest();
    var path = (window.location.pathname.indexOf("relay")>=0)?"../":"";
    xmlhttp.open('GET', path+'manifest.json');
    xmlhttp.onload = function (e) {
        var manifest = JSON.parse(xmlhttp.responseText);
        callback(manifest.version);
    };
    xmlhttp.send(null);
  }

  function getVersionInfo(callback) {
    getVersion(function(version) {
      var platform = "Web App";
      if (isNWApp())
        platform = "NW.js Native App";
      if (isChromeWebApp())
        platform = "Chrome App";

      callback(platform+", v"+version);
    });
  }

  // Converts a string to an ArrayBuffer
  function stringToArrayBuffer(str) {
    var buf=new Uint8Array(str.length);
    for (var i=0; i<str.length; i++) {
      var ch = str.charCodeAt(i);
      if (ch>=256) {
        console.warn("stringToArrayBuffer got non-8 bit character - code "+ch);
        ch = "?".charCodeAt(0);
      }
      buf[i] = ch;
    }
    return buf.buffer;
  }

  // Converts a string to a Buffer
  function stringToBuffer(str) {
    var buf = Buffer.alloc(str.length);
    for (var i = 0; i < buf.length; i++) {
      buf.writeUInt8(str.charCodeAt(i), i);
    }
    return buf;
  }

  // Converts a DataView to an ArrayBuffer
  function dataViewToArrayBuffer(dv) {
    var bufView = new Uint8Array(dv.byteLength);
    for (var i = 0; i < bufView.length; i++) {
      bufView[i] = dv.getUint8(i);
    }
    return bufView.buffer;
  }

  // Converts an ArrayBuffer to a string
  function arrayBufferToString(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
  }

  /* Parses a JSON string into JS, taking into account some of the issues
  with Espruino's JSON from 2v04 and before */
  function parseJSONish(str) {
    var lex = getLexer(str);
    var tok = lex.next();
    var final = "";
    while (tok!==undefined) {
      var s = tok.str;
      if (tok.type=="STRING") {
        s = s.replace(/\\([0-9])/g,"\\u000$1");
        s = s.replace(/\\x(..)/g,"\\u00$1");
      }
      final += s;
      tok = lex.next();
    }
    return JSON.parse(final);
  }

  /* Escape a string (like JSON.stringify) so that Espruino can understand it,
  however use \0,\1,\x,etc escapes whenever possible to make the String as small
  as it can be. On Espruino with UTF8 support, not using \u.... also allows it
  to use non-UTF8 Strings which are more efficient. */
  function toJSONishString(txt) {
    let js = "\"";
    for (let i=0;i<txt.length;i++) {
      let ch = txt.charCodeAt(i);
      let nextCh = (i+1<txt.length ? txt.charCodeAt(i+1) : 0); // 0..255
      if (ch<8) {
          // if the next character is a digit, it'd be interpreted
          // as a 2 digit octal character, so we can't use `\0` to escape it
          if (nextCh>='0'.charCodeAt() && nextCh<='7'.charCodeAt()) js += "\\x0"+ch;
          else js += "\\"+ch;
      } else if (ch==8) js += "\\b";
      else if (ch==9) js += "\\t";
      else if (ch==10) js += "\\n";
      else if (ch==11) js += "\\v";
      else if (ch==12) js += "\\f";
      else if (ch==34) js += "\\\""; // quote
      else if (ch==92) js += "\\\\"; // slash
      else if (ch<32 || ch==127 || ch==173 ||
               ((ch>=0xC2) && (ch<=0xF4))) // unicode start char range
          js += "\\x"+ ((ch & 255) | 256).toString(16).substring(1);
      else if (ch>255)
          js += "\\u"+ ((ch & 65535) | 65536).toString(16).substring(1);
      else js += txt[i];
    }
    js += "\"";
    //let b64 = "atob("+JSON.stringify(Espruino.Core.Utils.btoa(txt))+")";
    return js;
  }

  /* Convert a normal JS string (one char per character) to a string of UTF8 bytes (passes anything 0..255 straight through) */
  function asUTF8Bytes(str) {
    var result = "";
    var bytes = String.fromCharCode;
    for (var i=0; i < str.length; i++) {
      var charcode = str.charCodeAt(i);
      // checking below 128 would ensure better compatibility with UTF8 (but breaks pretokenised code)
      if (charcode < 256) result += bytes(charcode);
      else if (charcode < 0x800) {
        result += bytes(0xc0 | (charcode >> 6),
                        0x80 | (charcode & 0x3f));
      } else if (charcode < 0xd800 || charcode >= 0xe000) {
        result += bytes(0xe0 | (charcode >> 12),
                    0x80 | ((charcode>>6) & 0x3f),
                    0x80 | (charcode & 0x3f));
      } else { // surrogate pair
        i++;
        charcode = ((charcode&0x3ff)<<10)|(str.charCodeAt(i)&0x3ff)
        result += bytes(0xf0 | (charcode >>18),
                        0x80 | ((charcode>>12) & 0x3f),
                        0x80 | ((charcode>>6) & 0x3f),
                        0x80 | (charcode & 0x3f));
      }
    }
    return result;
  }

  // Does the given string contain only ASCII characters?
  function isASCII(str) {
    for (var i=0;i<str.length;i++) {
      var c = str.charCodeAt(i);
      if ((c<32 || c>126) &&
          (c!=10) && (c!=13) && (c!=9)) return false;
    }
    return true;
  }

  // btoa that works on utf8
  function btoa(input) {
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = "";
    var i=0;
    while (i<input.length) {
      var octet_a = 0|input.charCodeAt(i++);
      var octet_b = 0;
      var octet_c = 0;
      var padding = 0;
      if (i<input.length) {
        octet_b = 0|input.charCodeAt(i++);
        if (i<input.length) {
          octet_c = 0|input.charCodeAt(i++);
          padding = 0;
        } else
          padding = 1;
      } else
        padding = 2;
      var triple = (octet_a << 0x10) + (octet_b << 0x08) + octet_c;
      out += b64[(triple >> 18) & 63] +
             b64[(triple >> 12) & 63] +
             ((padding>1)?'=':b64[(triple >> 6) & 63]) +
             ((padding>0)?'=':b64[triple & 63]);
    }
    return out;
  }

  function atob(input) {
    // Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149
    // This code was written by Tyler Akins and has been placed in the
    // public domain.  It would be nice if you left this header intact.
    // Base64 code from Tyler Akins -- http://rumkin.com
    var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    var output = '';
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
    input = input.replace(/[^A-Za-z0-9+/=]/g, '');
    while (i < input.length) {
      enc1 = keyStr.indexOf(input.charAt(i++));
      enc2 = keyStr.indexOf(input.charAt(i++));
      enc3 = keyStr.indexOf(input.charAt(i++));
      enc4 = keyStr.indexOf(input.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output = output + String.fromCharCode(chr1);

      if (enc3 !== 64) {
        output = output + String.fromCharCode(chr2);
      }
      if (enc4 !== 64) {
        output = output + String.fromCharCode(chr3);
      }
    }
    return output;
  }

  Espruino.Core.Utils = {
      init : init,
      isWindows : isWindows,
      isLinux : isLinux,
      isAppleDevice : isAppleDevice,
      isChrome : isChrome,
      isFirefox : isFirefox,
      getChromeVersion : getChromeVersion,
      isNWApp : isNWApp,
      isChromeWebApp : isChromeWebApp,
      isProgressiveWebApp : isProgressiveWebApp,
      hasNativeTitleBar : hasNativeTitleBar,
      isCrossOriginSubframe : isCrossOriginSubframe,
      isARMThumb : isARMThumb,
      escapeHTML : escapeHTML,
      fixBrokenCode : fixBrokenCode,
      getSubString : getSubString,
      getLexer : getLexer,
      countBrackets : countBrackets,
      getEspruinoPrompt : getEspruinoPrompt,
      executeExpression : function(expr,callback) { executeExpression(expr,callback,{exprPrintsResult:false}); },
      executeStatement : function(statement,callback) { executeExpression(statement,callback,{exprPrintsResult:true}); },
      downloadFile : downloadFile, // (fileName, callback)
      getUploadFileCode : getUploadFileCode, //(fileName, contents);
      uploadFile : uploadFile, // (fileName, contents, callback)
      versionToFloat : versionToFloat,
      getURL : getURL,
      getBinaryURL : getBinaryURL,
      getJSONURL : getJSONURL,
      isURL : isURL,
      needsHTTPS : needsHTTPS,
      fileOpenDialog : fileOpenDialog,
      fileSaveDialog : fileSaveDialog,
      recognisedBluetoothDevices : recognisedBluetoothDevices,
      addRecognisedDeviceName : addRecognisedDeviceName,
      addRecognisedDeviceAddress : addRecognisedDeviceAddress,
      isRecognisedBluetoothDevice : isRecognisedBluetoothDevice,
      getVersion : getVersion,
      getVersionInfo : getVersionInfo,
      stringToArrayBuffer : stringToArrayBuffer,
      stringToBuffer : stringToBuffer,
      dataViewToArrayBuffer : dataViewToArrayBuffer,
      arrayBufferToString : arrayBufferToString,
      parseJSONish : parseJSONish,
      toJSONishString : toJSONishString,
      asUTF8Bytes : asUTF8Bytes,
      isASCII : isASCII,
      btoa : btoa,
      atob : atob
  };
}());

// demo.js: the hands-off camera tour (filled in below).
'use strict';
(function (TL) {
  const D = TL.Demo = { on: false };
  D.start = function () { D.on = true; };
  D.stop = function () { D.on = false; };
  D.update = function () {};
})(globalThis.TL = globalThis.TL || {});

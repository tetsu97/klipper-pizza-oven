(function(mod) {
  if (typeof exports == "object" && typeof module == "object") {
    mod(require("../../lib/codemirror"), require("../properties/properties"));
  } else if (typeof define == "function" && define.amd) {
    define(["../../lib/codemirror", "../properties/properties"], mod);
  } else {
    mod(CodeMirror);
  }
})(function(CodeMirror) {

  console.log("GCODE overlay loaded");

  CodeMirror.defineMode("klipperProps", function(config) {
    var baseMode = CodeMirror.getMode(config, "properties");

    var overlay = {
      token: function(stream) {
        if (stream.match(/(G\d+(\.\d+)?|M\d+|T\d+|SET_[A-Z0-9_]+)/, true)) {
          return "atom gcode";
        }
        while (stream.next() != null &&
               !stream.match(/(G\d+|M\d+|T\d+|SET_[A-Z0-9_]+)/, false)) {}
        return null;
      }
    };

    return CodeMirror.overlayMode(baseMode, overlay);
  });

});

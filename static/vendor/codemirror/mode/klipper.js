(function(mod) {
  if (typeof exports == "object" && typeof module == "object") {
    mod(require("../../lib/codemirror"),
        require("../properties/properties"),
        require("../../addon/mode/overlay"));
  } else if (typeof define == "function" && define.amd) {
    define(["../../lib/codemirror",
            "../properties/properties",
            "../../addon/mode/overlay"], mod);
  } else { mod(CodeMirror); }
})(function(CodeMirror) {
  // Base INI/properties
  function base(config){ return CodeMirror.getMode(config, "properties"); }

  // --- Overlay: [gcode_macro NAME] (část "gcode_macro" a "NAME" zvlášť) ---
  function macroHeaderOverlay() {
    return {
      startState(){ return { inHdr:false, afterPrefix:false }; },
      token(stream, state){
        if (!state.inHdr && stream.sol() && stream.match("[gcode_macro ", false)) {
          state.inHdr = true; state.afterPrefix = false;
        }
        if (state.inHdr) {
          if (!state.afterPrefix && stream.match("[gcode_macro ", true)) { state.afterPrefix = true; return "header"; }
          if (state.afterPrefix && stream.match(/^[^\]\r\n]+(?=\])/, true)) return "def";
          if (state.afterPrefix && stream.match("]", true)) { state.inHdr=false; return "header"; }
          stream.next(); return "header";
        }
        // DŮLEŽITÉ: ne skipToEnd(); jen posuň o 1
        stream.next(); return null;
      }
    };
  }

  // --- Overlay: label "gcode:" na začátku bloku ---
  function gcodeLabelOverlay(){
    return {
      token(stream){
        if (stream.sol() && stream.match(/^\s*gcode\s*:/, true)) return "keyword";
        stream.next(); return null; // ne skipToEnd()
      }
    };
  }

  // --- Overlay: G/M/T/SET_* příkazy (v jakékoli části řádku) ---
  const reG = /(G\d+(\.\d+)?|M\d+|T\d+|SET_[A-Z0-9_]+)/;
  const gcodeOverlay = {
    token(stream){
      if (stream.match(reG, true)) return "atom gcode";
      while (stream.next() != null && !stream.match(reG, false)) {}
      return null;
    }
  };

  // --- Overlay: Jinja {{ … }} a {% … %} s klíčovými slovy/filtry ---
  const kw = /\b(set|if|else|elif|for|in|endfor|endif|range|float|int|min|max|default)\b/;
  const ident = /[A-Za-z_][A-Za-z0-9_]*/;
  function jinjaOverlay() {
    const KW = /\b(set|if|else|elif|for|in|endfor|endif|range)\b/;
    const IDENT = /[A-Za-z_][A-Za-z0-9_]*/;

    return {
      startState() { return { in: null }; },
      token(stream, state) {
        if (!state.in && stream.match("{{")) { state.in = "expr"; return "jinja-delim"; }
        if (!state.in && stream.match("{%")) { state.in = "stmt"; return "jinja-delim"; }
        if (!state.in) { stream.next(); return null; }

        if (state.in === "expr" && stream.match("}}")) { state.in = null; return "jinja-delim"; }
        if (state.in === "stmt" && stream.match("%}")) { state.in = null; return "jinja-delim"; }

        if (stream.eatSpace()) return null;

        if (stream.match("|")) return "jinja-filter-delim";
        if (stream.match(IDENT)) {
          const prev = stream.string[stream.start - 1];
          if (state.in === "stmt" && KW.test(stream.current())) return "jinja-key";
          if (stream.current() === "printer" || stream.current() === "params") return "variable-2";
          if (prev === "|") return "jinja-filter";
          return "jinja-var";
        }
        if (stream.match(".")) return "operator";
        if (stream.match(/[-+]?\d+(\.\d+)?/)) return "number";
        if (stream.match("(") || stream.match(")")) return "bracket";

        stream.next(); return null;
      }
    };
  }

  // Složení módů – pořadí rozhoduje o tom, co „přebíjí“ co
  CodeMirror.defineMode("klipper", function(cfg){
    let m = CodeMirror.overlayMode(base(cfg), macroHeaderOverlay());
    m = CodeMirror.overlayMode(m, gcodeLabelOverlay());
    m = CodeMirror.overlayMode(m, gcodeOverlay);
    m = CodeMirror.overlayMode(m, jinjaOverlay());
    return m;
  });
});

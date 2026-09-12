(function () {
  if (!document.documentElement.classList.contains("boot")) {
    return;
  }

  var BOOT_LINES = [
    [300, "> SYSTEM BOOT v1.0.0"],
    [200, "> Initializing research core............. OK"],
    [300, "> Loading data modules................... OK"],
    [400, "> Compiling markets.ts................... OK"],
    [300, "> Fetching datasets......................"],
    [150, "  \u251C\u2500 markets \u2713"],
    [150, "  \u251C\u2500 writing \u2713"],
    [150, "  \u2514\u2500 builds \u2713"],
    [400, "> Establishing connection................ OK"],
    [200, "> All systems nominal"],
    [300, "> READY"],
  ];

  var GLYPH_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?<>+=";
  var SCRAMBLE_CYCLES = 8;
  var SCRAMBLE_INTERVAL = 40;
  var CHAR_STAGGER = 120;

  var overlay = document.createElement("div");
  overlay.id = "intro-overlay";
  overlay.setAttribute("aria-hidden", "true");

  var terminal = document.createElement("div");
  terminal.id = "intro-terminal";

  var doorLeft = document.createElement("div");
  doorLeft.className = "intro-door intro-door-left";

  var doorRight = document.createElement("div");
  doorRight.className = "intro-door intro-door-right";

  overlay.appendChild(terminal);
  overlay.appendChild(doorLeft);
  overlay.appendChild(doorRight);
  document.body.prepend(overlay);

  function runBootSequence() {
    return new Promise(function (resolve) {
      var lineIndex = 0;

      function showNextLine() {
        if (lineIndex >= BOOT_LINES.length) {
          var lines = terminal.querySelectorAll("div");
          var lastLine = lines[lines.length - 1];
          if (lastLine) {
            var cursor = document.createElement("span");
            cursor.className = "cursor";
            cursor.textContent = "\u2588";
            lastLine.appendChild(cursor);
          }
          setTimeout(resolve, 400);
          return;
        }

        var pair = BOOT_LINES[lineIndex];
        var delay = pair[0];
        var text = pair[1];
        lineIndex += 1;

        setTimeout(function () {
          var line = document.createElement("div");
          line.textContent = text;
          terminal.appendChild(line);
          showNextLine();
        }, delay);
      }

      showNextLine();
    });
  }

  function openDoors() {
    return new Promise(function (resolve) {
      terminal.style.opacity = "0";

      setTimeout(function () {
        doorLeft.classList.add("open");
        doorRight.classList.add("open");

        setTimeout(function () {
          overlay.remove();
          resolve();
        }, 1300);
      }, 200);
    });
  }

  function scrambleReveal(el, text) {
    return new Promise(function (resolve) {
      var chars = text.split("");
      var spans = [];

      el.textContent = "";
      for (var i = 0; i < chars.length; i += 1) {
        var span = document.createElement("span");
        if (chars[i] === " ") {
          span.textContent = "\u00A0";
        } else {
          span.textContent = "\u00A0";
          span.style.color = "var(--muted)";
        }
        el.appendChild(span);
        spans.push(span);
      }

      el.classList.add("is-revealing");

      var resolved = 0;
      var total = chars.filter(function (c) {
        return c !== " ";
      }).length;

      if (total === 0) {
        resolve();
        return;
      }

      for (var ci = 0; ci < chars.length; ci += 1) {
        (function (charIndex) {
          if (chars[charIndex] === " ") {
            return;
          }

          var startDelay = charIndex * CHAR_STAGGER;

          setTimeout(function () {
            var cycle = 0;

            var interval = setInterval(function () {
              if (cycle < SCRAMBLE_CYCLES) {
                var glyph = GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)];
                spans[charIndex].textContent = glyph;
                cycle += 1;
              } else {
                clearInterval(interval);
                spans[charIndex].textContent = chars[charIndex];
                spans[charIndex].style.color = "var(--fg)";
                resolved += 1;
                if (resolved === total) {
                  el.textContent = text;
                  resolve();
                }
              }
            }, SCRAMBLE_INTERVAL);
          }, startDelay);
        })(ci);
      }
    });
  }

  function typeHeadline(el) {
    var text = el.textContent.replace(/\s+/g, " ").trim();

    return new Promise(function (resolve) {
      el.classList.add("is-revealing");

      if (typeof Typed === "undefined") {
        el.textContent = text;
        resolve();
        return;
      }

      el.textContent = "";
      var span = document.createElement("span");
      span.className = "auto-type";
      el.appendChild(span);

      new Typed(span, {
        strings: [text],
        typeSpeed: 75,
        backSpeed: 0,
        loop: false,
        showCursor: true,
        cursorChar: "|",
        onComplete: function (self) {
          if (self.cursor) {
            self.cursor.remove();
          }
          el.textContent = text;
          resolve();
        },
      });
    });
  }

  function finishIntro() {
    document.documentElement.classList.add("intro-done");
    setTimeout(function () {
      document.documentElement.classList.remove("boot");
      document.documentElement.classList.remove("intro-done");
    }, 1400);
  }

  runBootSequence()
    .then(function () {
      return openDoors();
    })
    .then(function () {
      var name = document.querySelector(".name");
      return scrambleReveal(name, name.textContent);
    })
    .then(function () {
      return typeHeadline(document.querySelector("h1"));
    })
    .then(finishIntro);
})();

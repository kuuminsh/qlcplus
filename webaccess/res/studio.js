/*
  Q Light Controller Plus
  studio.js - tablet friendly scene editor

  Talks to QLC+ through the WebSocket API ("QLC+API|..." messages).
  See webaccess/src/webaccessstudio.h for the list of commands.

  Licensed under the Apache License, Version 2.0
*/

(function () {
  "use strict";

  /* ---------------- texts ---------------- */
  var TEXTS = {
    en: {
      connected: "Connected", disconnected: "Disconnected",
      solo: "Solo", save: "Save", saved: "Saved", filter: "Search scenes…",
      noProject: "No scenes found. Load a project in QLC+.",
      pick: "Pick a scene on the left.", root: "Scenes",
      start: "Start", stop: "Stop", running: "Running", stopped: "Stopped",
      edit: "Edit without starting",
      saveOk: "Project saved", saveNoFile: "Save the project once in QLC+ first (File → Save as)",
      saveErr: "Saving failed", saveUnsupported: "Saving not supported by this QLC+ build",
      noFixtures: "This scene has no fixtures."
    },
    lv: {
      connected: "Savienots", disconnected: "Nav savienojuma",
      solo: "Solo", save: "Saglabāt", saved: "Saglabāts", filter: "Meklēt scēnas…",
      noProject: "Scēnas nav atrastas. Ielādē projektu QLC+.",
      pick: "Izvēlies scēnu kreisajā pusē.", root: "Scēnas",
      start: "Ieslēgt", stop: "Izslēgt", running: "Skan", stopped: "Izslēgta",
      edit: "Rediģēt, neieslēdzot",
      saveOk: "Projekts saglabāts", saveNoFile: "Vispirms vienreiz saglabā projektu QLC+ (File → Save as)",
      saveErr: "Saglabāšana neizdevās", saveUnsupported: "Šī QLC+ versija saglabāšanu neatbalsta",
      noFixtures: "Šajā scēnā nav ierīču."
    }
  };
  var lang = (navigator.language || "en").slice(0, 2).toLowerCase();
  var T = TEXTS[lang] || TEXTS.en;

  /* ---------------- state ---------------- */
  var ws = null;
  var connected = false;
  var scenes = [];            // [{id,name,path,running,...}]
  var current = null;         // full scene JSON being edited
  var modified = false;
  var dragging = {};          // "fx:ch" -> true while the finger is on a slider
  var pending = {};           // "fx:ch" -> value waiting to be sent
  var sendTimer = null;
  var statusTimer = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- websocket ---------------- */
  function connect() {
    var url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/qlcplusWS";
    ws = new WebSocket(url);

    ws.onopen = function () {
      setConnected(true);
      api("getScenesJSON");
      api("getProjectStatus");
      if (current) api("getSceneJSON", current.id);
    };
    ws.onclose = function () {
      setConnected(false);
      setTimeout(connect, 1000);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) { /* ignore */ } };
    ws.onmessage = function (ev) { onMessage(ev.data); };
  }

  function api() {
    if (!connected) return;
    var parts = ["QLC+API"].concat(Array.prototype.slice.call(arguments));
    ws.send(parts.join("|"));
  }

  function onMessage(data) {
    // QLC+API|<cmd>|<json>  (json may contain '|', so split only twice)
    if (data.indexOf("QLC+API|") === 0) {
      var rest = data.substring(8);
      var sep = rest.indexOf("|");
      var cmd = sep < 0 ? rest : rest.substring(0, sep);
      var payload = sep < 0 ? "" : rest.substring(sep + 1);
      var json = null;
      try { json = payload ? JSON.parse(payload) : null; } catch (e) { return; }
      handleAPI(cmd, json);
      return;
    }

    // FUNCTION|<id>|Running/Stopped
    var p = data.split("|");
    if (p[0] === "FUNCTION" && p.length >= 3) {
      setRunning(parseInt(p[1], 10), p[2] === "Running");
    }
  }

  function handleAPI(cmd, json) {
    switch (cmd) {
      case "getScenesJSON":
        scenes = json || [];
        renderSceneList();
        if (!current) renderEmpty(scenes.length ? T.pick : T.noProject);
        break;
      case "getSceneJSON":
        if (json) { current = json; renderEditor(); }
        break;
      case "sceneValueChanged":
        applyRemoteValue(json);
        markModified();
        break;
      case "getProjectStatus":
        modified = !!(json && json.modified);
        renderSaveButton();
        break;
      case "saveProject":
        var r = json && json.result;
        toast(r === "ok" ? T.saveOk : r === "noFileName" ? T.saveNoFile :
              r === "unsupported" ? T.saveUnsupported : T.saveErr);
        break;
    }
  }

  /* ---------------- scene list ---------------- */
  function renderSceneList() {
    var list = $("sceneList");
    var q = $("filter").value.trim().toLowerCase();
    list.textContent = "";

    // group scenes by their QLC+ folder (path)
    var groups = {};
    var order = [];
    scenes.forEach(function (s) {
      if (q && s.name.toLowerCase().indexOf(q) < 0 && (s.path || "").toLowerCase().indexOf(q) < 0) return;
      var key = s.path || "";
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(s);
    });
    order.sort(function (a, b) { return a.localeCompare(b); });

    order.forEach(function (key) {
      var title = document.createElement("div");
      title.className = "group-title";
      title.textContent = key || T.root;
      list.appendChild(title);

      groups[key].sort(function (a, b) { return a.name.localeCompare(b.name); });
      groups[key].forEach(function (s) { list.appendChild(sceneItem(s)); });
    });
  }

  function sceneItem(s) {
    var item = document.createElement("div");
    item.className = "scene-item" + (s.running ? " running" : "") +
                     (current && current.id === s.id ? " selected" : "");
    item.dataset.id = s.id;

    var led = document.createElement("span");
    led.className = "led";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = s.name;
    var edit = document.createElement("button");
    edit.className = "edit";
    edit.title = T.edit;
    edit.textContent = "✎";

    item.appendChild(led);
    item.appendChild(name);
    item.appendChild(edit);

    // tap the row: switch to this scene and edit it
    item.addEventListener("click", function () {
      if ($("soloMode").checked) api("soloScene", s.id);
      else api("setFunctionStatus", s.id, s.running ? 0 : 1);
      openScene(s.id);
    });
    // tap the pencil: edit only
    edit.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openScene(s.id);
    });
    return item;
  }

  function openScene(id) {
    api("getSceneJSON", id);
    var items = document.querySelectorAll(".scene-item");
    for (var i = 0; i < items.length; i++)
      items[i].classList.toggle("selected", parseInt(items[i].dataset.id, 10) === id);
  }

  function setRunning(id, running) {
    scenes.forEach(function (s) { if (s.id === id) s.running = running; });
    var el = document.querySelector('.scene-item[data-id="' + id + '"]');
    if (el) el.classList.toggle("running", running);
    if (current && current.id === id) {
      current.running = running;
      renderSceneHead();
    }
  }

  /* ---------------- editor ---------------- */
  function renderEmpty(msg) {
    var ed = $("editor");
    ed.textContent = "";
    var div = document.createElement("div");
    div.className = "empty";
    div.textContent = msg;
    ed.appendChild(div);
  }

  function renderEditor() {
    var ed = $("editor");
    ed.textContent = "";

    var head = document.createElement("div");
    head.className = "scene-head";
    head.id = "sceneHead";
    ed.appendChild(head);
    renderSceneHead();

    if (!current.fixtures.length) {
      var e = document.createElement("div");
      e.className = "empty";
      e.textContent = T.noFixtures;
      ed.appendChild(e);
      return;
    }

    var grid = document.createElement("div");
    grid.className = "fixtures";
    current.fixtures.forEach(function (fx) { grid.appendChild(fixtureCard(fx)); });
    ed.appendChild(grid);
  }

  function renderSceneHead() {
    var head = $("sceneHead");
    if (!head || !current) return;
    head.textContent = "";

    var titles = document.createElement("div");
    var h1 = document.createElement("h1");
    h1.textContent = current.name;
    var path = document.createElement("div");
    path.className = "path";
    path.textContent = (current.path || T.root) + " · " + (current.running ? T.running : T.stopped);
    titles.appendChild(h1);
    titles.appendChild(path);

    var grow = document.createElement("div");
    grow.className = "grow";

    var btn = document.createElement("button");
    btn.className = "btn " + (current.running ? "" : "run");
    btn.textContent = current.running ? T.stop : T.start;
    btn.addEventListener("click", function () {
      if (current.running) api("setFunctionStatus", current.id, 0);
      else if ($("soloMode").checked) api("soloScene", current.id);
      else api("setFunctionStatus", current.id, 1);
    });

    head.appendChild(titles);
    head.appendChild(grow);
    head.appendChild(btn);
  }

  var COLOURS = {
    Red: "#ff4d4d", Green: "#3fd46b", Blue: "#4d8dff", White: "#f5f5f5",
    Amber: "#ffb000", UV: "#9b5cff", Cyan: "#34e0e0", Magenta: "#ff4dd2", Yellow: "#ffe14d",
    Lime: "#b6ff3b", Indigo: "#5b4dff"
  };

  function fixtureCard(fx) {
    var card = document.createElement("div");
    card.className = "fixture";
    card.dataset.fx = fx.id;

    var head = document.createElement("div");
    head.className = "fixture-head";
    var title = document.createElement("div");
    title.className = "title";
    title.textContent = fx.name;
    var addr = document.createElement("div");
    addr.className = "addr";
    addr.textContent = "U" + fx.universe + " · " + fx.address;
    var sw = document.createElement("div");
    sw.className = "swatch";
    head.appendChild(sw);
    head.appendChild(title);
    head.appendChild(addr);
    card.appendChild(head);

    fx.channels.forEach(function (ch) { card.appendChild(channelRow(fx, ch)); });
    updateSwatch(fx, sw);
    return card;
  }

  function channelRow(fx, ch) {
    var key = fx.id + ":" + ch.index;
    var row = document.createElement("div");
    row.className = "channel" + (ch.enabled ? " enabled" : "");
    row.dataset.key = key;

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = ch.enabled;

    var label = document.createElement("div");
    label.className = "label";
    label.textContent = ch.name;
    label.title = ch.name + " (" + ch.group + ")";

    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0; slider.max = 255; slider.step = 1;
    slider.value = ch.value;
    if (ch.colour && COLOURS[ch.colour]) slider.style.setProperty("--c", COLOURS[ch.colour]);
    paintSlider(slider);

    var val = document.createElement("div");
    val.className = "val";
    val.textContent = ch.value;

    cb.addEventListener("change", function () {
      ch.enabled = cb.checked;
      row.classList.toggle("enabled", ch.enabled);
      if (ch.enabled) api("setSceneValue", current.id, fx.id, ch.index, ch.value);
      else api("unsetSceneValue", current.id, fx.id, ch.index);
      updateSwatchFor(fx);
    });

    slider.addEventListener("pointerdown", function () { dragging[key] = true; });
    var release = function () { delete dragging[key]; };
    slider.addEventListener("pointerup", release);
    slider.addEventListener("pointercancel", release);
    slider.addEventListener("change", release);

    slider.addEventListener("input", function () {
      ch.value = parseInt(slider.value, 10);
      val.textContent = ch.value;
      paintSlider(slider);
      if (!ch.enabled) {             // moving a slider enables the channel
        ch.enabled = true;
        cb.checked = true;
        row.classList.add("enabled");
      }
      queueSend(fx.id, ch.index, ch.value);
      updateSwatchFor(fx);
    });

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(val);
    return row;
  }

  function paintSlider(slider) {
    slider.style.setProperty("--p", (slider.value / 255 * 100) + "%");
  }

  /* throttle: at most one message per channel every 40 ms */
  function queueSend(fxId, chIndex, value) {
    pending[fxId + ":" + chIndex] = value;
    if (sendTimer) return;
    sendTimer = setTimeout(flush, 40);
  }

  function flush() {
    sendTimer = null;
    if (!current) { pending = {}; return; }
    Object.keys(pending).forEach(function (key) {
      var p = key.split(":");
      api("setSceneValue", current.id, p[0], p[1], pending[key]);
    });
    pending = {};
  }

  /* a value changed (by us or by another tablet) */
  function applyRemoteValue(msg) {
    if (!msg || !current || msg.scene !== current.id) return;
    var key = msg.fixture + ":" + msg.channel;
    var fx = null, ch = null;
    current.fixtures.forEach(function (f) {
      if (f.id === msg.fixture) {
        fx = f;
        f.channels.forEach(function (c) { if (c.index === msg.channel) ch = c; });
      }
    });
    if (!fx || !ch) return;

    ch.enabled = msg.enabled;
    if (msg.enabled && !dragging[key] && pending[key] === undefined) ch.value = msg.value;

    var row = document.querySelector('.channel[data-key="' + key + '"]');
    if (!row) return;
    row.classList.toggle("enabled", ch.enabled);
    row.querySelector("input[type=checkbox]").checked = ch.enabled;
    if (!dragging[key] && pending[key] === undefined) {
      var slider = row.querySelector("input[type=range]");
      slider.value = ch.value;
      paintSlider(slider);
      row.querySelector(".val").textContent = ch.value;
    }
    updateSwatchFor(fx);
  }

  function updateSwatchFor(fx) {
    var card = document.querySelector('.fixture[data-fx="' + fx.id + '"]');
    if (card) updateSwatch(fx, card.querySelector(".swatch"));
  }

  /* rough preview of the fixture colour from its R/G/B/W and dimmer channels */
  function updateSwatch(fx, sw) {
    var r = null, g = null, b = null, w = 0, dim = 255, any = false;
    fx.channels.forEach(function (c) {
      if (c.group !== "Intensity" || !c.enabled) return;
      if (c.colour === "Red") { r = c.value; any = true; }
      else if (c.colour === "Green") { g = c.value; any = true; }
      else if (c.colour === "Blue") { b = c.value; any = true; }
      else if (c.colour === "White") { w = c.value; any = true; }
      else if (!c.colour || c.colour === "None" || c.colour === "Generic") { dim = c.value; any = true; }
    });
    if (!any) { sw.style.visibility = "hidden"; return; }
    sw.style.visibility = "visible";
    if (r === null && g === null && b === null) { r = g = b = 255; }
    var f = dim / 255;
    var mix = function (v) { return Math.min(255, Math.round(((v || 0) + w) * f)); };
    sw.style.background = "rgb(" + mix(r) + "," + mix(g) + "," + mix(b) + ")";
  }

  /* ---------------- save / status ---------------- */
  function markModified() {
    modified = true;
    renderSaveButton();
    // confirm with QLC+ a little later (it knows the real state)
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { api("getProjectStatus"); }, 800);
  }

  function renderSaveButton() {
    var btn = $("saveBtn");
    btn.disabled = !connected || !modified;
    btn.textContent = modified ? T.save : T.saved;
    btn.classList.toggle("primary", modified);
  }

  function setConnected(on) {
    connected = on;
    $("conn").dataset.state = on ? "on" : "off";
    $("connText").textContent = on ? T.connected : T.disconnected;
    renderSaveButton();
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3000);
  }

  /* ---------------- init ---------------- */
  window.addEventListener("load", function () {
    $("soloText").textContent = T.solo;
    $("filter").placeholder = T.filter;
    $("saveBtn").textContent = T.saved;
    $("saveBtn").addEventListener("click", function () { flush(); api("saveProject"); });
    $("filter").addEventListener("input", renderSceneList);

    try {
      var solo = localStorage.getItem("qlcStudioSolo");
      if (solo !== null) $("soloMode").checked = solo === "1";
    } catch (e) { /* storage not available */ }
    $("soloMode").addEventListener("change", function () {
      try { localStorage.setItem("qlcStudioSolo", $("soloMode").checked ? "1" : "0"); } catch (e) { /* ignore */ }
    });

    setConnected(false);
    renderEmpty(T.pick);
    connect();
  });
})();

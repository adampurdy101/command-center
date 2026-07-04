/* ============================================================
   WEATHER STATION  ·  globe panel readout
   ------------------------------------------------------------
   Renton + Pattaya, driven by Open-Meteo (free, no API key):
     · current temperature (°F) + condition symbol
     · feels-like, humidity, wind (mph + compass)
     · sunrise / sunset + a live "golden hour" countdown
     · current UV index + US air-quality index
     · Pattaya local time + the hour gap vs. Renton
     · tonight's moon phase + % illumination (computed locally)
   Data refetches every 10 min; the live clock / countdown / moon
   re-render every 30 s without a network hit. Nothing here needs
   a key — every call is a public Open-Meteo endpoint.
   ============================================================ */
(function () {
  "use strict";

  var SPOTS = [
    { city: "renton",  lat: 47.48, lon: -122.21, tz: "America/Los_Angeles" },
    { city: "pattaya", lat: 12.93, lon: 100.88,  tz: "Asia/Bangkok" }
  ];
  var HOME = "renton";        // the hour-gap + day/night are measured from home
  var data = {};              // city -> { fc, aq, at }
  var started = false;

  /* ---------- tiny DOM helpers ---------- */
  function cell(city, f) { return document.querySelector('.wxcity[data-city="' + city + '"] [data-f="' + f + '"]'); }
  function set(city, f, txt) { var el = cell(city, f); if (el && txt != null) el.textContent = txt; }

  /* ---------- formatting ---------- */
  function wxSymbol(code) {
    if (code == null) return "";
    if (code === 0) return "☀";
    if (code <= 2) return "🌤";
    if (code === 3) return "☁";
    if (code >= 45 && code <= 48) return "🌫";
    if (code >= 51 && code <= 67) return "🌧";
    if (code >= 71 && code <= 77) return "❄";
    if (code >= 80 && code <= 82) return "🌦";
    if (code >= 95) return "⛈";
    return "·";
  }
  function windDir(deg) {
    if (deg == null) return "";
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  }
  function uvWord(u) {
    if (u == null) return "";
    if (u < 3) return "Low"; if (u < 6) return "Mod"; if (u < 8) return "High"; if (u < 11) return "V.High"; return "Extreme";
  }
  function aqiWord(a) {
    if (a == null) return "";
    if (a <= 50) return "Good"; if (a <= 100) return "Moderate"; if (a <= 150) return "USG";
    if (a <= 200) return "Unhealthy"; if (a <= 300) return "V.Unhealthy"; return "Hazardous";
  }
  // "20:57" (local-ISO "…T20:57") -> "8:57p"
  function fmtClockISO(iso) {
    if (!iso) return "—";
    var m = /T(\d{2}):(\d{2})/.exec(iso); if (!m) return "—";
    var h = +m[1], ap = h < 12 ? "a" : "p", h12 = h % 12 || 12;
    return h12 + ":" + m[2] + ap;
  }
  // combine a city-local ISO time with the city's utc offset -> absolute ms
  function isoToInstant(iso, offSec) {
    if (!iso) return null;
    var s = offSec < 0 ? "-" : "+", a = Math.abs(offSec || 0);
    var hh = ("0" + Math.floor(a / 3600)).slice(-2), mm = ("0" + Math.floor((a % 3600) / 60)).slice(-2);
    var t = Date.parse(iso + ":00" + s + hh + ":" + mm);
    return isFinite(t) ? t : null;
  }
  function human(ms) {
    if (ms < 0) ms = -ms;
    var mins = Math.round(ms / 60000), h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? (h + "h " + m + "m") : (m + "m");
  }

  /* ---------- moon phase (no API) ---------- */
  function moon(now) {
    var SYN = 29.530588853;
    var ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;   // known new moon
    var age = (((now / 86400000) - ref) % SYN + SYN) % SYN;
    var illum = Math.round((1 - Math.cos(2 * Math.PI * age / SYN)) / 2 * 100);
    var names = [
      [1.85, "New Moon", "🌑"], [5.53, "Waxing Crescent", "🌒"], [9.22, "First Quarter", "🌓"],
      [12.91, "Waxing Gibbous", "🌔"], [16.61, "Full Moon", "🌕"], [20.30, "Waning Gibbous", "🌖"],
      [23.99, "Last Quarter", "🌗"], [27.68, "Waning Crescent", "🌘"]
    ];
    var pick = names[0];
    for (var i = 0; i < names.length; i++) { if (age < names[i][0]) { pick = names[i]; break; } }
    var full = 14.7653, toFull = age <= full ? (full - age) : (SYN - age + full);
    return { name: pick[1], emoji: pick[2], illum: illum, toFull: Math.round(toFull) };
  }

  /* ---------- timezone helpers (DST-correct via Intl) ---------- */
  function offsetMin(tz, now) {
    try {
      var d = new Date(now);
      return Math.round((new Date(d.toLocaleString("en-US", { timeZone: tz })) -
        new Date(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 60000);
    } catch (e) { return 0; }
  }
  function cityClock(tz, now) {
    try { return new Date(now).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  }

  /* ---------- current-hour value out of an hourly array ---------- */
  function hourlyNow(fc, key) {
    try {
      if (!fc || !fc.hourly || !fc.hourly[key] || !fc.current) return null;
      var nowH = (fc.current.time || "").slice(0, 13);   // "YYYY-MM-DDTHH"
      for (var i = 0; i < fc.hourly.time.length; i++) {
        if (fc.hourly.time[i].slice(0, 13) === nowH) { var v = fc.hourly[key][i]; return v == null ? null : v; }
      }
    } catch (e) {}
    return null;
  }

  /* ---------- fetch ---------- */
  function fetchCity(s) {
    var fc = "https://api.open-meteo.com/v1/forecast?latitude=" + s.lat + "&longitude=" + s.lon +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
      "&daily=sunrise,sunset&hourly=uv_index&forecast_days=2" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto";
    var aq = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + s.lat + "&longitude=" + s.lon +
      "&current=us_aqi&hourly=us_aqi&timezone=auto";
    return Promise.all([
      fetch(fc).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(aq).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      data[s.city] = { fc: res[0], aq: res[1], at: Date.now() };
      renderCity(s);
    }).catch(function () {});
  }

  /* ---------- render: conditions (on fetch) ---------- */
  function renderCity(s) {
    var snap = data[s.city]; if (!snap) return;
    var fc = snap.fc, aq = snap.aq;
    if (fc && fc.current) {
      var c = fc.current;
      set(s.city, "temp", Math.round(c.temperature_2m) + "°");
      set(s.city, "sym", wxSymbol(c.weather_code));
      set(s.city, "feel", "feels " + Math.round(c.apparent_temperature) + "°");
      set(s.city, "hum", "💧 " + Math.round(c.relative_humidity_2m) + "%");
      set(s.city, "wind", "🌬 " + Math.round(c.wind_speed_10m) + " " + windDir(c.wind_direction_10m));
      var uv = hourlyNow(fc, "uv_index");
      if (uv != null) uv = Math.round(uv);
      set(s.city, "uv", uv == null ? "☀ UV —" : ("☀ UV " + uv + " " + uvWord(uv)));
    }
    var aqi = null;
    if (aq && aq.current && aq.current.us_aqi != null) aqi = Math.round(aq.current.us_aqi);
    else { var h = hourlyNowAQ(aq); if (h != null) aqi = Math.round(h); }
    set(s.city, "aqi", aqi == null ? "AQI —" : ("AQI " + aqi + " " + aqiWord(aqi)));
    renderSun(s);
  }
  // air-quality API has its own current.time; reuse hourlyNow shape
  function hourlyNowAQ(aq) {
    try {
      if (!aq || !aq.hourly || !aq.hourly.us_aqi || !aq.current) return null;
      var nowH = (aq.current.time || "").slice(0, 13);
      for (var i = 0; i < aq.hourly.time.length; i++) {
        if (aq.hourly.time[i].slice(0, 13) === nowH) return aq.hourly.us_aqi[i];
      }
    } catch (e) {}
    return null;
  }

  /* ---------- render: sun times + golden-hour countdown (on tick) ---------- */
  function renderSun(s) {
    var snap = data[s.city]; if (!snap || !snap.fc || !snap.fc.daily) return;
    var fc = snap.fc, d = fc.daily, off = fc.utc_offset_seconds || 0, now = Date.now();
    var riseISO = d.sunrise && d.sunrise[0], setISO = d.sunset && d.sunset[0];
    set(s.city, "rise", "↑ " + fmtClockISO(riseISO));
    set(s.city, "set", "↓ " + fmtClockISO(setISO));
    var gold = cell(s.city, "gold"); if (!gold) return;
    gold.classList.remove("now");
    var setInst = isoToInstant(setISO, off), riseInst = isoToInstant(riseISO, off);
    if (riseInst && now < riseInst) {
      gold.textContent = "🌙 sunrise in " + human(riseInst - now);
    } else if (setInst && now < setInst) {
      var ms = setInst - now;
      if (ms <= 3600000) { gold.classList.add("now"); gold.textContent = "✦ golden hour · " + human(ms) + " left"; }
      else gold.textContent = "⏳ " + human(ms) + " to sunset";
    } else {
      var rise2 = d.sunrise && d.sunrise[1] ? isoToInstant(d.sunrise[1], off) : null;
      gold.textContent = rise2 ? ("🌙 night · sunrise in " + human(rise2 - now)) : "🌙 after sunset";
    }
  }

  /* ---------- render: moon + Pattaya clock (on tick) ---------- */
  function renderMoon() {
    var el = document.getElementById("wxmoon"); if (!el) return;
    var m = moon(Date.now());
    el.textContent = m.emoji + "  " + m.name + " · " + m.illum + "% lit · " +
      (m.toFull <= 0 ? "full moon tonight" : "full moon in " + m.toFull + "d");
  }
  function renderClock() {
    var now = Date.now();
    var homeSpot = null; for (var i = 0; i < SPOTS.length; i++) if (SPOTS[i].city === HOME) homeSpot = SPOTS[i];
    var homeOff = homeSpot ? offsetMin(homeSpot.tz, now) : 0;
    SPOTS.forEach(function (s) {
      var el = cell(s.city, "clock"); if (!el) return;
      if (s.city === HOME) { el.textContent = ""; return; }
      var gap = Math.round((offsetMin(s.tz, now) - homeOff) / 60);
      el.textContent = cityClock(s.tz, now) + " · " + (gap >= 0 ? "+" : "−") + Math.abs(gap) + "h";
    });
  }

  function tick() { SPOTS.forEach(renderSun); renderMoon(); renderClock(); }
  function loadAll() { SPOTS.forEach(fetchCity); }

  function start() {
    if (started || !document.querySelector(".wxstation")) return;
    started = true;
    renderMoon(); renderClock();     // instant paint of the local-only bits
    loadAll();
    setInterval(loadAll, 10 * 60 * 1000);
    setInterval(tick, 30 * 1000);
  }

  if (document.getElementById("hub")) start();
  document.addEventListener("hub:ready", function () { setTimeout(start, 300); });
})();

#!/usr/bin/env node

/**
 * fix-branch-names.js
 *
 * Downloads the Starbucks locations CSV and updates each country's spot JSON
 * file with the real store name (branch) and street address from the CSV,
 * matched by closest lat/lng within 500 m.
 *
 * Usage:  node scripts/fix-branch-names.js
 * No external dependencies required (uses built-in fetch and fs/path).
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CSV_URL =
  "https://raw.githubusercontent.com/chrismeller/StarbucksLocations/master/stores.csv";

const COUNTRY_FILES = {
  KR: "spots-kr.json",
  US: "spots-us.json",
  JP: "spots-jp.json",
  FR: "spots-fr.json",
  GB: "spots-gb.json",
  SG: "spots-sg.json",
  TH: "spots-th.json",
};

const MAX_DISTANCE_METERS = 500;

const SCRIPTS_DIR = path.resolve(__dirname);

// ---------------------------------------------------------------------------
// Haversine distance (metres)
// ---------------------------------------------------------------------------

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ---------------------------------------------------------------------------
// Minimal CSV parser – handles quoted fields that may contain commas/newlines
// ---------------------------------------------------------------------------

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  // Read one field starting at position i. Returns [value, nextIndex].
  function readField() {
    if (i >= len) return ["", i];

    if (text[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let value = "";
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            // Escaped quote
            value += '"';
            i += 2;
          } else {
            // End of quoted field
            i++; // skip closing quote
            break;
          }
        } else {
          value += text[i];
          i++;
        }
      }
      return value;
    } else {
      // Unquoted field – read until comma or newline
      let start = i;
      while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
        i++;
      }
      return text.slice(start, i);
    }
  }

  while (i < len) {
    const row = [];
    while (true) {
      const value = readField();
      row.push(value);

      if (i >= len) break;

      if (text[i] === ",") {
        i++; // skip comma, continue reading fields
        continue;
      }

      // End of line
      if (text[i] === "\r") i++;
      if (i < len && text[i] === "\n") i++;
      break;
    }
    // Skip empty trailing rows
    if (row.length === 1 && row[0] === "") continue;
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Download CSV --------------------------------------------------------
  console.log("Downloading Starbucks locations CSV...");
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  console.log(`Downloaded CSV (${(csvText.length / 1024 / 1024).toFixed(1)} MB)`);

  // 2. Parse CSV -----------------------------------------------------------
  console.log("Parsing CSV...");
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Build a column-name -> index map
  const col = {};
  headers.forEach((h, idx) => {
    col[h.trim()] = idx;
  });

  // Validate that we have the columns we need
  for (const needed of ["Name", "Street1", "CountryCode", "Latitude", "Longitude"]) {
    if (col[needed] === undefined) {
      throw new Error(`CSV is missing expected column: ${needed}`);
    }
  }

  console.log(`Parsed ${dataRows.length.toLocaleString()} store rows`);

  // 3. Index CSV rows by country code for fast lookup ----------------------
  const csvByCountry = {}; // { "KR": [ {name, street1, lat, lng}, ... ] }
  for (const row of dataRows) {
    const cc = (row[col["CountryCode"]] || "").trim();
    if (!cc) continue;

    const lat = parseFloat(row[col["Latitude"]]);
    const lng = parseFloat(row[col["Longitude"]]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const entry = {
      name: (row[col["Name"]] || "").trim(),
      street1: (row[col["Street1"]] || "").trim(),
      lat,
      lng,
    };

    if (!csvByCountry[cc]) csvByCountry[cc] = [];
    csvByCountry[cc].push(entry);
  }

  console.log(
    "CSV countries indexed:",
    Object.keys(csvByCountry)
      .sort()
      .map((c) => `${c}(${csvByCountry[c].length})`)
      .join(", ")
  );

  // 4. Process each country file -------------------------------------------
  let totalSpots = 0;
  let totalMatched = 0;
  let totalWarnings = 0;

  for (const [countryCode, fileName] of Object.entries(COUNTRY_FILES)) {
    const filePath = path.join(SCRIPTS_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      console.log(`\nSkipping ${fileName} (file not found)`);
      continue;
    }

    const spots = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const csvStores = csvByCountry[countryCode] || [];

    console.log(
      `\nProcessing ${fileName}: ${spots.length} spots, ${csvStores.length} CSV stores for ${countryCode}`
    );

    if (csvStores.length === 0) {
      console.warn(`  WARNING: No CSV stores found for country ${countryCode}`);
      totalWarnings += spots.length;
      totalSpots += spots.length;
      continue;
    }

    let matched = 0;
    let warnings = 0;

    for (const spot of spots) {
      // Find the closest CSV store by haversine distance
      let bestDist = Infinity;
      let bestStore = null;

      for (const store of csvStores) {
        const dist = haversineDistance(spot.lat, spot.lng, store.lat, store.lng);
        if (dist < bestDist) {
          bestDist = dist;
          bestStore = store;
        }
      }

      if (bestStore && bestDist <= MAX_DISTANCE_METERS) {
        spot.branch = bestStore.name;
        spot.address = bestStore.street1;
        matched++;
      } else {
        const distStr = bestDist === Infinity ? "N/A" : `${bestDist.toFixed(0)}m`;
        console.warn(
          `  WARNING: No match within ${MAX_DISTANCE_METERS}m for spot at (${spot.lat}, ${spot.lng}) branch="${spot.branch}" – closest: ${distStr}`
        );
        warnings++;
      }
    }

    // Save updated file
    fs.writeFileSync(filePath, JSON.stringify(spots, null, 2) + "\n", "utf-8");

    console.log(
      `  Saved ${fileName}: ${matched}/${spots.length} matched, ${warnings} warnings`
    );

    totalSpots += spots.length;
    totalMatched += matched;
    totalWarnings += warnings;
  }

  // 5. Summary -------------------------------------------------------------
  console.log("\n========================================");
  console.log(`Done! ${totalMatched}/${totalSpots} spots matched.`);
  if (totalWarnings > 0) {
    console.log(`${totalWarnings} spots had no match within ${MAX_DISTANCE_METERS}m.`);
  }
  console.log("========================================");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

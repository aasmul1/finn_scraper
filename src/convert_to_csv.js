const fs = require("fs");
const path = require("path");

const INPUT = path.join(__dirname, "../data/finn_ad_data.json");
const OUTPUT = path.join(__dirname, "../data/finn_ad_data.csv");

const COLUMNS = [
  "ad_id",
  "source_url",
  "scraped_at",
  "title",
  "price_nok",
  "tilstand",
  "merke",
  "kjonn",
  "sykkeltype",
  "brand",
  "model",
  "year",
  "framesize",
  "groupset",
  "description",
  "location",
];

function parsePrice(raw) {
  if (!raw) return "";
  // "52 000 kr" -> 52000
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : "";
}

function cleanText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\r\n|\r|\n/g, " ")  // replace all newlines with a space
    .replace(/\s+/g, " ")          // collapse multiple spaces into one
    .trim();
}

function escapeField(value) {
  const str = value == null ? "" : String(value);
  // Wrap in quotes and escape any inner quotes as ""
  return `"${str.replace(/"/g, '""')}"`;
}

function toRow(ad) {
  const row = {
    ad_id: ad.ad_id,
    source_url: ad.source_url,
    scraped_at: ad.scraped_at,
    title: ad.title,
    price_nok: parsePrice(ad.price),
    tilstand: ad.tilstand,
    merke: ad.merke,
    kjonn: ad.kjonn,
    sykkeltype: ad.sykkeltype,
    brand:       ad.brand,
    model:       ad.model,
    year:        ad.year,
    framesize:   ad.framesize,
    groupset:    ad.groupset,
    description: cleanText(ad.description),
    location:    ad.location,
  };
  return COLUMNS.map((col) => escapeField(row[col])).join(",");
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("finn_ad_data.json not found.");
    process.exit(1);
  }

  const ads = JSON.parse(fs.readFileSync(INPUT, "utf-8"));

  const header = COLUMNS.join(",");
  const rows = ads.map(toRow);
  const csv = [header, ...rows].join("\n");

  fs.writeFileSync(OUTPUT, csv, "utf-8");
  console.log(`Wrote ${ads.length} rows to finn_ad_data.csv`);
}

main();

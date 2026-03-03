/**
 * Finn.no Ad Detail Scraper (JSON version)
 * ========================================
 * Setup:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   node finn_scraper.js
 *   node finn_scraper.js --url "https://www.finn.no/recommerce/forsale/item/450736924"
 *   node finn_scraper.js --url "https://..." --output my_output.json
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const DEFAULT_URL = "https://www.finn.no/recommerce/forsale/item/450736924";
const DEFAULT_OUTPUT = "finn_ad_data.json";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { url: DEFAULT_URL, output: DEFAULT_OUTPUT };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url")    result.url    = args[++i];
    if (args[i] === "--output") result.output = args[++i];
  }
  return result;
}

async function scrapeDetailPage(page, url) {

  await page.goto(url);
  await page.waitForLoadState("networkidle");

  // TITLE
  const title = await page
    .locator('podium-layout >> [data-testid="object-title"]')
    .innerText();

  // PRICE
  const price = await page
    .locator("podium-layout >> text=/kr/")
    .first()
    .innerText();

  // -----------------------------
  // NØKKELINFO
  // -----------------------------

  const keyInfo = page.locator(
    'podium-layout >> section[aria-label="Nøkkelinfo"] span p'
  );

  const count = await keyInfo.count();

  let tilstand = "";
  let merke = "";
  let kjonn = "";
  let sykkeltype = "";

  for (let i = 0; i < count; i++) {
    const row = keyInfo.nth(i);

    const labelText = await row.innerText();
    const label = labelText.split(":")[0].trim();

    const value = await row.locator("b").innerText();

    if (label === "Tilstand")   tilstand = value;
    if (label === "Merke")      merke = value;
    if (label === "Kjønn")      kjonn = value;
    if (label === "Sykkeltype") sykkeltype = value;
  }

  // -----------------------------
  // DESCRIPTION
  // -----------------------------

  const description = await page
    .locator('podium-layout >> section[data-testid="description"]')
    .innerText();

  // -----------------------------
  // LOCATION
  // -----------------------------

  const location = await page
    .locator('podium-layout >> [data-testid="object-address"]')
    .innerText();

  return {
    title,
    price,
    tilstand,
    merke,
    kjonn,
    sykkeltype,
    description,
    location
  };
}

function saveToJSON(record, outputPath) {
  let existing = [];

  if (fs.existsSync(outputPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  existing.push(record);

  fs.writeFileSync(
    outputPath,
    JSON.stringify(existing, null, 2),
    "utf-8"
  );

  console.log(`\nSaved -> ${path.resolve(outputPath)}`);
}

async function main() {
  const { url, output } = parseArgs();
  console.log(`Fetching: ${url}`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    locale: "nb-NO",
    viewport: { width: 1280, height: 900 },
  });

  await context.addInitScript(
    "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
  );

  const page = await context.newPage();

  try {
    const data = await scrapeDetailPage(page, url);

    const record = {
      ad_id:      url.split("/item/").pop().split("?")[0],
      source_url: url,
      scraped_at: new Date().toISOString(),
      ...data,
    };

    console.log(`\nExtracted ${Object.keys(record).length} fields:\n`);
    for (const [k, v] of Object.entries(record)) {
      const display =
        String(v).length > 100
          ? String(v).slice(0, 100) + "..."
          : v;
      console.log(`${k.padEnd(20)}: ${display}`);
    }

    saveToJSON(record, output);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
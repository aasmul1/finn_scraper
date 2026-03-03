const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// change if needed
const URL_FILE = "../data/ad_urls.json";
const OUTPUT = "../data/finn_ad_data.json";

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

function loadUrls() {
  if (!fs.existsSync(URL_FILE)) {
    console.log("No ad_urls.json found.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(URL_FILE, "utf-8"));
}

function loadExistingAds() {
  if (!fs.existsSync(OUTPUT)) return [];
  try {
    return JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));
  } catch {
    return [];
  }
}

function saveAds(data) {
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function main() {

  const urls = loadUrls();
  const existingAds = loadExistingAds();

  const scrapedIds = new Set(
    existingAds.map(a => a.ad_id)
  );

  const browser = await chromium.launch({
    headless: true,
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

  let processed = 0;
  let newScraped = 0;

  try {

    for (const url of urls) {

      const ad_id = url.split("/item/").pop().split("?")[0];

      if (scrapedIds.has(ad_id)) {
        processed++;
        continue;
      }

      try {
        const data = await scrapeDetailPage(page, url);

        const record = {
          ad_id,
          source_url: url,
          scraped_at: new Date().toISOString(),
          ...data,
        };

        existingAds.push(record);
        scrapedIds.add(ad_id);
        newScraped++;
        processed++;

        if (processed % 50 === 0) {
          console.log(
            `Processed: ${processed}/${urls.length} | New scraped: ${newScraped}`
          );
        }

      } catch {
        processed++;
      }
    }

    saveAds(existingAds);

  } finally {
    await browser.close();
  }

  console.log(
    `Finished. Total processed: ${processed}. New ads scraped: ${newScraped}.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
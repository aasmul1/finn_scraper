const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL =
  "https://www.finn.no/recommerce/forsale/search?bikes_type=3&price_from=5000&price_to=55000&sub_category=1.69.3963";

const URL_FILE = path.join(__dirname, "../data/ad_urls.json");
const DATA_FILE = path.join(__dirname, "../data/finn_ad_data.json");

// ---- scrapeDetailPage must exist in this file ----
// Make sure your working scrapeDetailPage function is pasted above runMonitor()

function loadJSON(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function buildPageUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl);
  url.searchParams.set("page", pageNumber);
  return url.toString();
}

async function scrapeListingPage(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });

  const links = page.locator(
    'a[href*="/recommerce/forsale/item/"]'
  );

  const count = await links.count();
  const urls = new Set();

  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    if (!href) continue;

    const clean = href.split("?")[0];
    const full = clean.startsWith("http")
      ? clean
      : `https://www.finn.no${clean}`;

    urls.add(full);
  }

  return Array.from(urls);
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

async function runMonitor() {
  console.log("Running monitor job...");

  const existingUrls = new Set(loadJSON(URL_FILE));
  const existingAds = loadJSON(DATA_FILE);
  const scrapedIds = new Set(existingAds.map((a) => a.ad_id));

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

  let pageNumber = 1;
  let newUrls = [];
  let totalPagesChecked = 0;

  try {
    while (true) {
      const pagedUrl =
        pageNumber === 1
          ? BASE_URL
          : buildPageUrl(BASE_URL, pageNumber);

      console.log(`Checking page ${pageNumber}...`);

      const urls = await scrapeListingPage(page, pagedUrl);

      if (urls.length === 0) break;

      for (const url of urls) {
        if (!existingUrls.has(url)) {
          existingUrls.add(url);
          newUrls.push(url);
        }
      }

      totalPagesChecked++;
      pageNumber++;
    }

    console.log(`Pages checked: ${totalPagesChecked}`);
    console.log(`New URLs found: ${newUrls.length}`);

    let processed = 0;

    for (const url of newUrls) {
      const ad_id = url.split("/item/").pop().split("?")[0];

      if (scrapedIds.has(ad_id)) continue;

      try {
        const data = await scrapeDetailPage(page, url);

        existingAds.push({
          ad_id,
          source_url: url,
          scraped_at: new Date().toISOString(),
          ...data,
        });

        scrapedIds.add(ad_id);
        processed++;

        if (processed % 25 === 0) {
          console.log(`Processed ${processed} new ads...`);
        }
      } catch (err) {
        console.log(`Failed scraping ${url}`);
      }
    }

    saveJSON(URL_FILE, Array.from(existingUrls));
    saveJSON(DATA_FILE, existingAds);

    console.log("Monitor finished successfully.");
  } finally {
    await browser.close();
  }
}

runMonitor().catch((err) => {
  console.error("Monitor crashed:", err);
  process.exit(1);
});
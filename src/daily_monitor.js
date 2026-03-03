const cron = require("../node_modules/node-cron/dist/cjs/node-cron");
const { chromium } = require("playwright");
const fs = require("fs");

const BASE_URL = "https://www.finn.no/recommerce/forsale/search?bikes_type=3&price_from=5000&price_to=55000&sub_category=1.69.3963";

const URL_FILE = "ad_urls.json";
const DATA_FILE = "finn_ad_data.json";

// ---- paste your scrapeDetailPage function here ----

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

  await page.goto(url);
  await page.waitForLoadState("networkidle");

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

async function runMonitor() {

  console.log("Running daily monitor...");

  const existingUrls = new Set(loadJSON(URL_FILE));
  const existingAds = loadJSON(DATA_FILE);
  const scrapedIds = new Set(existingAds.map(a => a.ad_id));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let pageNumber = 1;
  let newUrls = [];

  try {

    while (true) {

      const pagedUrl =
        pageNumber === 1
          ? BASE_URL
          : buildPageUrl(BASE_URL, pageNumber);

      const urls = await scrapeListingPage(page, pagedUrl);

      if (urls.length === 0) break;

      for (const url of urls) {
        if (!existingUrls.has(url)) {
          existingUrls.add(url);
          newUrls.push(url);
        }
      }

      pageNumber++;
    }

    console.log(`New URLs found: ${newUrls.length}`);

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

      } catch {}
    }

    saveJSON(URL_FILE, Array.from(existingUrls));
    saveJSON(DATA_FILE, existingAds);

    console.log("Monitor finished.");

  } finally {
    await browser.close();
  }
}

// Run every day at 21:00
cron.schedule("0 21 * * *", () => {
  runMonitor();
});

console.log("Daily monitor scheduled for 21:00.");
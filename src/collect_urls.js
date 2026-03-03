const { chromium } = require("playwright");
const fs = require("fs");

const BASE_URL = process.argv[2];
const OUTPUT = "ad_urls.json";

function loadExisting() {
  if (!fs.existsSync(OUTPUT)) return [];
  try {
    return JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));
  } catch {
    return [];
  }
}

function saveUrls(urls) {
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(urls, null, 2)
  );
  console.log(`Saved ${urls.length} total unique URLs`);
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

async function main() {

  if (!BASE_URL) {
    console.log("Usage: node collect_urls.js <listing_url>");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const existing = new Set(loadExisting());
  const discovered = new Set(existing);

  let pageNumber = 1;

  try {

    while (true) {

      const pagedUrl =
        pageNumber === 1
          ? BASE_URL
          : buildPageUrl(BASE_URL, pageNumber);

      console.log(`Scraping page ${pageNumber}`);

      const urls = await scrapeListingPage(page, pagedUrl);

      if (urls.length === 0) {
        console.log("No ads found. Stopping.");
        break;
      }

      let newOnThisPage = 0;

      for (const url of urls) {
        if (!discovered.has(url)) {
          discovered.add(url);
          newOnThisPage++;
        }
      }

      console.log(
        `Found ${urls.length} ads (${newOnThisPage} new)`
      );

      pageNumber++;
    }

    saveUrls(Array.from(discovered));

  } finally {
    await browser.close();
  }
}

main();
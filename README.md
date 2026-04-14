# Finn Scraper

A scraper and deal classifier for second-hand bicycles on [finn.no](https://www.finn.no). It scrapes listings, enriches them with AI-extracted specs, and trains a classifier to rate deals as **good**, **ok**, or **bad**.

---

## Project Structure

```
finn_scraper/
├── src/                        # Node.js scraping scripts
│   ├── scraper.js              # Scrape a single bike listing
│   ├── collect_urls.js         # Collect listing URLs from search pages
│   ├── scrape_from_urls.js     # Batch-scrape all collected URLs
│   ├── enrich_ads.js           # Enrich data with Claude AI (specs extraction)
│   ├── daily_monitor.js        # Daily job: find and scrape new listings
│   └── convert_to_csv.js       # Export JSON data to CSV
├── notebooks/
│   ├── label_studio_prep.ipynb         # Prepare batches for labeling + import results
│   ├── bike_classifier_training.ipynb  # Train the deal classifier
│   └── bike_deal_classifier.ipynb      # Feature engineering and model evaluation
├── data/                       # All data files (see below)
├── models/
│   └── bike_deal_classifier.joblib     # Trained sklearn classifier
└── .github/workflows/
    └── scraper.yml             # GitHub Actions: daily automated scrape
```

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Python](https://www.python.org/) 3.9+
- [Label Studio](https://labelstud.io/) (for manual labeling)
- An [Anthropic API key](https://console.anthropic.com/) (for AI enrichment)

### 1. Install Node.js dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Install Python dependencies

```bash
pip install pandas numpy scikit-learn xgboost jupyter label-studio
```

### 3. Set up environment variables

Create a `.env` file in the project root (never committed to git):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Or export it in your shell before running scripts:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Running the Scraper

### Collect URLs from a search page

```bash
node src/collect_urls.js "https://www.finn.no/recommerce/forsale/search?bikes_type=3"
```

Saves discovered URLs to `data/ad_urls.json`.

### Scrape a single listing

```bash
node src/scraper.js --url "https://www.finn.no/recommerce/forsale/item/450736924"
```

### Batch-scrape all collected URLs

```bash
node src/scrape_from_urls.js
```

Reads `data/ad_urls.json`, scrapes each listing, saves results to `data/finn_ad_data.json`. Skips already-scraped ads and saves progress every 50 items.

### Enrich listings with AI

```bash
ANTHROPIC_API_KEY=sk-ant-... node src/enrich_ads.js
```

Uses the Claude API to extract structured specs (brand, model, year, groupset, frame size, etc.) from listing titles and descriptions. Saves progress every 25 ads.

### Export to CSV

```bash
node src/convert_to_csv.js
```

Converts `data/finn_ad_data.json` to `data/finn_ad_data.csv`.

### Daily monitoring (automated)

```bash
node src/daily_monitor.js
```

Finds new listings since the last run, scrapes them, and updates data files. This runs automatically every day at **21:00 Norway time** via GitHub Actions.

---

## Label Studio: Manual Labeling Workflow

Label Studio is used to manually label a sample of bikes as **good deal**, **ok deal**, or **bad deal**. The notebook pre-annotates each task with a model prediction so labeling is faster.

### Step 1: Start Label Studio

```bash
label-studio start
```

Label Studio runs at **http://localhost:8080**. Create an account on first launch.

### Step 2: Prepare a labeling batch

Open and run `notebooks/label_studio_prep.ipynb` (Sections 1–4).

This will:
- Load and preprocess the scraped data
- Run a price regression model to estimate fair value
- Sample 50 bikes (stratified: ~16 good / 16 ok / 16 bad)
- Generate `data/label_studio_batch_1.json` with pre-annotations

### Step 3: Create a project in Label Studio

1. Go to **http://localhost:8080** and create a new project
2. In **Labeling Setup**, switch to **Custom template** and paste the XML from the notebook (Section 3 output)
3. Import `data/label_studio_batch_1.json` as tasks

### Step 4: Label the bikes

For each task:
- Read the HTML card showing asking price, model-predicted price, and specs
- Click the Finn.no link to view photos and full description
- Confirm or override the pre-annotated label (good / ok / bad)
- Click **Submit**

### Step 5: Export annotations

In Label Studio, export the project as **JSON** and save to:

```
data/label_studio_export_batch_1.json
```

### Step 6: Import labels back

Run Sections 5–8 of `notebooks/label_studio_prep.ipynb`.

This will:
- Parse human annotations from the export file
- Merge labels onto the full feature set
- Append to `data/finn_labeled.csv`
- Update `data/already_labeled_ids.json` to avoid re-labeling

---

## Training the Classifier

Open and run `notebooks/bike_classifier_training.ipynb`.

- Input: `data/finn_labeled.csv` and `data/finn_preprocessed.csv`
- Output: `models/bike_deal_classifier.joblib`

The model predicts whether a listing is a **good**, **ok**, or **bad** deal based on price, condition, brand, groupset tier, frame size, and component upgrades.

---

## Data Files

All data is stored in `data/`:

| File | Description |
|------|-------------|
| `ad_urls.json` | All discovered listing URLs |
| `finn_ad_data.json` | Master dataset — all scraped ads (raw) |
| `finn_ad_data.csv` | CSV export of the master dataset |
| `already_labeled_ids.json` | Tracks which ad IDs have been labeled (prevents duplicates) |
| `label_studio_batch_N.json` | Tasks exported to Label Studio for batch N |
| `label_studio_export_batch_N.json` | Human annotations exported from Label Studio for batch N |
| `finn_labeled.csv` | Ground-truth labels from all completed batches |
| `finn_preprocessed.csv` | Feature-engineered dataset used for model training |

The trained model is stored in `models/bike_deal_classifier.joblib`.

---

## Automated Pipeline (GitHub Actions)

The workflow in `.github/workflows/scraper.yml` runs daily and:

1. Collects new listing URLs
2. Scrapes new ads
3. Enriches with Claude API (requires `ANTHROPIC_API_KEY` secret in repo settings)
4. Converts to CSV
5. Commits and pushes updated data files

To configure the secret: **GitHub repo → Settings → Secrets → Actions → New secret** → name: `ANTHROPIC_API_KEY`.

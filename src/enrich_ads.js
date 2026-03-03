const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/finn_ad_data.json");

const client = new Anthropic();

// JSON schema Claude must conform to — empty string for unknown string fields
const BIKE_SCHEMA = {
  type: "object",
  properties: {
    brand:              { type: "string",  description: "Bicycle brand / manufacturer, e.g. Canyon, Trek, Specialized" },
    model:              { type: "string",  description: "Bicycle model name, e.g. Aeroad CF SLX 8.0 Di2" },
    year:               { type: "string",  description: "Year of manufacture as 4-digit string, e.g. 2021. Empty if unknown." },
    framesize:          { type: "string",  description: "Frame size, e.g. L, 56cm, Medium, 54. Empty if unknown." },
    wheel_size:         { type: "string",  description: "Wheel size, e.g. 700c, 29\", 27.5\". Empty if unknown." },
    groupset:           { type: "string",  description: "Drivetrain groupset, e.g. Shimano Ultegra Di2, SRAM Force eTap. Empty if unknown." },
    carbon_frame:       { type: "boolean", description: "True if the frame is explicitly stated to be carbon fibre." },
    carbon_wheels:      { type: "boolean", description: "True if the wheels / rims are explicitly stated to be carbon." },
    electronic_shifting:{ type: "boolean", description: "True if the gearing / shifting is electronic (Di2, eTap, EPS, AXS, etc.)." },
  },
  required: ["brand", "model", "year", "framesize", "wheel_size", "groupset", "carbon_frame", "carbon_wheels", "electronic_shifting"],
  additionalProperties: false,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractDetails(ad) {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    system:
      "You are an expert at parsing Norwegian bicycle classified ads. " +
      "Extract the requested fields from the title and description. " +
      "Use an empty string for any field you cannot determine with confidence.",
    messages: [
      {
        role: "user",
        content:
          `Title: ${ad.title}\n` +
          `Brand (merke): ${ad.merke || ""}\n` +
          `Description: ${ad.description || ""}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        json_schema: {
          name: "bike_details",
          schema: BIKE_SCHEMA,
        },
      },
    },
  });

  return JSON.parse(response.content[0].text);
}

async function main() {
  const ads = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  // Process ads missing any field from the current schema
  const toProcess = ads.filter((ad) => ad.carbon_frame === undefined);

  console.log(
    `Enriching ${toProcess.length} ads (${ads.length - toProcess.length} already done)...`
  );

  if (toProcess.length === 0) {
    console.log("Nothing to enrich.");
    return;
  }

  let enriched = 0;
  let failed = 0;

  for (const ad of toProcess) {
    try {
      const details = await extractDetails(ad);
      Object.assign(ad, details);
      enriched++;
    } catch (err) {
      console.error(`Failed to enrich ${ad.ad_id}: ${err.message}`);
      // Mark with empty/false values so we skip this ad on the next run
      Object.assign(ad, {
        brand: ad.merke || "", model: "", year: "", framesize: "", wheel_size: "", groupset: "",
        carbon_frame: false, carbon_wheels: false, electronic_shifting: false,
      });
      failed++;
    }

    // Save progress every 25 ads so a crash doesn't lose all work
    if ((enriched + failed) % 25 === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(ads, null, 2));
      console.log(`Progress: ${enriched + failed}/${toProcess.length}`);
    }

    // Stay well within Anthropic rate limits
    await sleep(1200);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(ads, null, 2));
  console.log(`Done. Enriched: ${enriched}, failed: ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

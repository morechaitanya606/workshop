const fs = require("fs");

try {
    const jsonString = fs.readFileSync(
        "C:/Users/Chait/.gemini/antigravity/brain/ed2454ad-4c46-42af-bae8-3e3bed734d8d/.system_generated/steps/596/output.txt",
        "utf8"
    );
    const data = JSON.parse(jsonString);
    const typesString = data.types;
    fs.writeFileSync(
        "d:/Users/Chait/Pratice/tts/workshop/app/src/lib/database.types.ts",
        typesString,
        "utf8"
    );
    console.log("Types written successfully!");
} catch (err) {
    console.error(err);
}

const { execSync } = require("child_process");
const fs = require("fs");

try {
    console.log("Running eslint --fix...");
    const tc = execSync('npx eslint --fix "src/**/*.{js,jsx,ts,tsx}"', {
        encoding: "utf-8",
        stdio: "pipe",
    });
    fs.writeFileSync("lint_fix.log", tc || "Success");
} catch (e) {
    fs.writeFileSync(
        "lint_fix.log",
        (e.stdout || "") + "\n" + (e.stderr || "") + "\n" + (e.message || "")
    );
}

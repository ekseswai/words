const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", ".ecdict-source", "ecdict.csv");
const output = path.join(__dirname, "..", "data");
const text = fs.readFileSync(source, "utf8");
const rows = [];
let row = [], field = "", quoted = false;

for (let index = 0; index < text.length; index += 1) {
  const char = text[index];
  if (quoted) {
    if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = false;
    else field += char;
  } else if (char === '"') quoted = true;
  else if (char === ',') { row.push(field); field = ""; }
  else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
  else if (char !== "\r") field += char;
}

const [header, ...entries] = rows;
const wordIndex = header.indexOf("word");
const translationIndex = header.indexOf("translation");
const chunks = Object.fromEntries("abcdefghijklmnopqrstuvwxyz".split("").map((letter) => [letter, {}]));

for (const entry of entries) {
  const word = entry[wordIndex]?.trim().toLowerCase();
  const meaning = entry[translationIndex]?.replace(/\s*\n\s*/g, "；").trim();
  if (!word || !meaning || !/^[a-z]/.test(word)) continue;
  const letter = word[0];
  if (!chunks[letter][word] || chunks[letter][word].length < meaning.length) chunks[letter][word] = meaning;
}

fs.mkdirSync(output, { recursive: true });
for (const [letter, dictionary] of Object.entries(chunks)) {
  fs.writeFileSync(path.join(output, `${letter}.json`), JSON.stringify(dictionary));
}
console.log(`Created ${Object.keys(chunks).length} dictionary chunks from ${entries.length} entries.`);

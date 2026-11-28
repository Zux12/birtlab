// Run after adding editions. Persist each choice so it stays with the published story.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chooseVisual, imageById} from '../research-watch/visuals.mjs';

const root = fileURLToPath(new URL('../research-watch/', import.meta.url));
const months = fs.readdirSync(root).filter(name => /^\d{4}-\d\d\.json$/.test(name)).sort();
const lastUsed = new Map();
let order = 0;
for (const month of months) {
  const path = root + month;
  const editions = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const day of Object.keys(editions).sort()) {
    let previous = '';
    for (const story of editions[day]) {
      if (story.image && !imageById.has(story.image)) throw new Error('Unknown image for PMID ' + story.pmid);
      if (!story.image) {
        story.image = chooseVisual(story, lastUsed, previous).id;
        changed = true;
      }
      lastUsed.set(story.image, order++);
      previous = story.image;
    }
  }
  if (changed) fs.writeFileSync(path, JSON.stringify(editions, null, 2) + '\n');
}

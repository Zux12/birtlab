import {chooseVisual, imageById, imagePath, conferenceSlot} from './visuals.mjs';

// The conference switches every three Malaysian calendar days from launch.
const launch = Date.UTC(2026, 10, 28);
const dayMs = 86400000;
const clockOffset = 8 * 3600000;
const formatDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
});
const stamp = document.querySelector('#news-edition');
const stories = document.querySelector('#news-stories');
const conference = stories.querySelector('.news-lead').cloneNode(true);
const conferenceTitle = conference.querySelector('h3').textContent;
const conferenceUrl = conference.querySelector('a').getAttribute('href');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(className, text, href) {
  const node = element('a', className, text);
  node.href = href;
  return node;
}

function conferenceCard(art, featured) {
  if (featured) {
    const lead = conference.cloneNode(true);
    const image = lead.querySelector('img');
    image.src = art.src;
    image.alt = art.alt;
    image.classList.add('news-conference-photo');
    return lead;
  }
  const row = element('div', 'news-row');
  const action = link('news-compact-link', '', conferenceUrl);
  const image = element('img', 'news-thumb');
  image.src = art.src;
  image.alt = '';
  const copy = element('span', 'news-row-copy');
  copy.append(element('span', 'news-label', 'Conference · September 2027'),
    element('span', 'news-title', conferenceTitle + ' · Registration opening soon'));
  action.append(image, copy);
  row.append(action);
  return row;
}

function imageFor(story, featured) {
  const libraryImage = imageById.get(story.image) || chooseVisual(story);
  const figure = story.figure;
  // Only the locally stored, credited figure for this PMID may override the illustration.
  const hasFigure = figure && figure.alt && figure.credit && figure.license &&
    /^https:\/\//.test(figure.source || '') && /^https:\/\/creativecommons\.org\//.test(figure.licenseUrl || '');
  const image = element('img', featured ? 'news-photo' : 'news-thumb');
  const visual = element(featured ? 'figure' : 'span', featured ? 'news-figure' : 'news-thumb-wrap');
  const caption = element(featured ? 'figcaption' : 'span', 'news-image-caption');
  const credit = element('div', 'news-image-credit');
  const illustration = () => {
    image.src = imagePath(libraryImage.id, !featured);
    image.alt = 'Illustration: ' + libraryImage.alt;
    image.classList.remove('news-study-figure');
    caption.textContent = 'Illustration';
    credit.replaceChildren();
    credit.hidden = true;
  };
  if (hasFigure) {
    image.addEventListener('error', illustration, {once:true});
    image.src = 'research-watch/figures/' + story.pmid + '.webp';
    image.alt = figure.alt;
    image.classList.add('news-study-figure');
    caption.textContent = 'Study figure';
    credit.append(link('', figure.credit, figure.source), ' · ', link('', figure.license, figure.licenseUrl));
  } else illustration();
  visual.append(image, caption);
  return {visual, credit};
}

function researchStory(story, featured) {
  const url = 'https://pubmed.ncbi.nlm.nih.gov/' + story.pmid + '/';
  const label = element('span', 'news-label', 'Research Watch · ' + story.topic);
  const {visual, credit} = imageFor(story, featured);
  const body = element('div', 'news-detail');
  body.append(element('p', '', story.summary),
    element('div', 'news-meta', story.journal + ' · ' + formatDate.format(Date.parse(story.published))),
    link('news-link', 'Read the paper →', url), credit);

  if (featured) {
    const lead = element('article', 'news-lead');
    const title = element('h3');
    title.append(link('', story.headline, url));
    lead.append(visual, label, title, body);
    return lead;
  }
  const row = element('div', 'news-row');
  const details = element('details');
  const summary = element('summary');
  const copy = element('span', 'news-row-copy');
  copy.append(label, element('span', 'news-title', story.headline));
  summary.append(visual, copy);
  details.append(summary, body);
  row.append(details);
  return row;
}

function complete(pair) {
  return Array.isArray(pair) && pair.length === 2 && pair[0]?.pmid !== pair[1]?.pmid &&
    pair.every(p => p && /^\d+$/.test(p.pmid) && Number.isFinite(Date.parse(p.published)) &&
      [p.headline, p.topic, p.journal, p.summary].every(s => typeof s === 'string' && s.trim()));
}

async function loadMonth(date) {
  const month = date.slice(0, 7);
  const response = await fetch('research-watch/' + month + '.json', {cache: 'no-cache'});
  if (!response.ok) return null;
  const editions = await response.json();
  const edition = Object.keys(editions).sort().reverse()
    .find(key => key <= date && complete(editions[key]));
  return edition ? {edition, pair: editions[edition]} : null;
}

let request = 0;
let timer;
let displayed = '';

async function refresh() {
  const currentRequest = ++request;
  clearTimeout(timer);
  const localTime = Date.now() + clockOffset;
  const today = new Date(localTime).toISOString().slice(0, 10);
  const day = Date.parse(today);
  const slot = conferenceSlot(day, launch, dayMs);
  let retry = true;
  try {
    // A delayed edition or an unavailable source leaves the last dated pair on screen.
    let selection = await loadMonth(today);
    if (!selection) {
      const previousMonth = new Date(Date.UTC(Number(today.slice(0,4)), Number(today.slice(5,7)) - 1, 0));
      selection = await loadMonth(previousMonth.toISOString().slice(0,10));
    }
    if (currentRequest !== request || !selection) return;
    const {edition, pair} = selection;
    retry = edition !== today;
    const key = [edition, ...pair.map(p => p.pmid + '/' + p.image + '/' + (p.figure?.source || '')), slot.featured, slot.art.src].join('/');
    if (displayed === key) return;
    const lead = researchStory(pair[0], !slot.featured);
    stories.replaceChildren(...(slot.featured ? [conferenceCard(slot.art, true), lead] : [lead, conferenceCard(slot.art, false)]),
      researchStory(pair[1], false));
    stamp.dateTime = edition;
    stamp.textContent = formatDate.format(Date.parse(edition));
    displayed = key;
  } catch {
    // The server-rendered conference and launch stories are usable without the feed.
  } finally {
    if (currentRequest === request) {
      const untilMidnight = dayMs - ((Date.now() + clockOffset) % dayMs) + 150;
      timer = setTimeout(refresh, retry ? Math.min(30 * 60000, untilMidnight) : untilMidnight);
    }
  }
}

refresh();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
